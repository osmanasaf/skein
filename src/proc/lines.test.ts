import { describe, expect, it } from "vitest";
import { LineSplitter } from "./lines.js";

function collect(chunks: string[], flush = true): string[] {
  const lines: string[] = [];
  const s = new LineSplitter((l) => lines.push(l));
  for (const c of chunks) s.push(c);
  if (flush) s.flush();
  return lines;
}

describe("LineSplitter", () => {
  it("tam satırları verir", () => {
    expect(collect(["a\nb\n"])).toEqual(["a", "b"]);
  });

  // Akışın en sık görülen sessiz arızası: parça JSON'a yarım gider.
  it("parçalara bölünmüş satırı birleştirir", () => {
    expect(collect(['{"type":', '"assistant"}', "\n"])).toEqual(['{"type":"assistant"}']);
  });

  it("tek bir parçadaki çok satırı ayırır", () => {
    expect(collect(["a\nb\nc\n"])).toEqual(["a", "b", "c"]);
  });

  it("boş satırları atlar", () => {
    expect(collect(["a\n\n\nb\n"])).toEqual(["a", "b"]);
  });

  it("CRLF'te satır sonu artığı bırakmaz", () => {
    expect(collect(["a\r\nb\r\n"])).toEqual(["a", "b"]);
  });

  // Ajanın son kaydı satır sonu görmemiş olabilir.
  it("flush tamponda kalanı verir", () => {
    expect(collect(["a\nson parça"])).toEqual(["a", "son parça"]);
  });

  it("flush edilmezse yarım satır verilmez", () => {
    expect(collect(["a\nyarım"], false)).toEqual(["a"]);
  });

  it("flush iki kez çağrılırsa tekrar vermez", () => {
    const lines: string[] = [];
    const s = new LineSplitter((l) => lines.push(l));
    s.push("tek");
    s.flush();
    s.flush();
    expect(lines).toEqual(["tek"]);
  });
});
