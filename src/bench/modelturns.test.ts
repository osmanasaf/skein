import { describe, expect, it } from "vitest";
import { modelTurns } from "./modelturns.js";

// Doctor'ın "MODEL HİÇ ÇAĞRILMADI" koruması bu sayıya bakıyor: exit 0 dönen
// ama modeli hiç çağırmayan bir çağrı, hatadan daha kötüdür çünkü başarılı
// görünür. Operatörün makinesinde tam olarak bu oldu.
describe("modelTurns", () => {
  describe("tek JSON nesnesi (claude)", () => {
    it("usage.iterations uzunluğunu verir", () => {
      expect(modelTurns(JSON.stringify({ usage: { iterations: [1, 2, 3] } }))).toBe(3);
    });

    it("modelUsage anahtar sayısını verir", () => {
      expect(modelTurns(JSON.stringify({ modelUsage: { "claude-x": {}, "claude-y": {} } }))).toBe(2);
    });

    it("sıfır tur SIFIR döner, undefined değil — koruma ateşlenebilsin", () => {
      expect(modelTurns(JSON.stringify({ usage: { iterations: [] } }))).toBe(0);
    });
  });

  // Codex `exec --json` JSONL basıyor: her satır bir olay. Eskiden
  // `JSON.parse(stdout)` atıyor ve undefined dönüyordu; doctor "?" basıyor,
  // sıfır-tur koruması da codex'te HİÇ ateşlenemiyordu.
  describe("JSONL (codex)", () => {
    const olay = (o: unknown): string => JSON.stringify(o);

    it("turn.completed olaylarını sayar", () => {
      const out = [
        olay({ type: "thread.started", thread_id: "x" }),
        olay({ type: "turn.started" }),
        olay({ type: "item.completed", item: { type: "agent_message", text: "4" } }),
        olay({ type: "turn.completed", usage: { input_tokens: 13607, output_tokens: 11 } }),
      ].join("\n");
      expect(modelTurns(out)).toBe(1);
    });

    it("birden çok turu sayar", () => {
      const out = [
        olay({ type: "turn.started" }), olay({ type: "turn.completed" }),
        olay({ type: "turn.started" }), olay({ type: "turn.completed" }),
      ].join("\n");
      expect(modelTurns(out)).toBe(2);
    });

    // Asıl kazanç: olay akışı var ama hiç tur tamamlanmamış. Artık 0 dönüyor,
    // yani doctor "model hiç çağrılmadı" diye durdurabiliyor.
    it("olay var ama tur yoksa SIFIR döner", () => {
      const out = [olay({ type: "thread.started" }), olay({ type: "error", message: "boş" })].join("\n");
      expect(modelTurns(out)).toBe(0);
    });

    it("JSON olmayan satırlar sayımı bozmaz", () => {
      const out = ["uyarı: bir şey", olay({ type: "turn.completed" }), ""].join("\n");
      expect(modelTurns(out)).toBe(1);
    });
  });

  describe("tanınmayan biçim", () => {
    it("boş çıktıda undefined", () => {
      expect(modelTurns("   ")).toBeUndefined();
    });

    it("JSON olmayan metinde undefined", () => {
      expect(modelTurns("komut bulunamadı")).toBeUndefined();
    });

    // `type` alanı olmayan JSON satırları olay akışı değildir: sayılmaz ve
    // sıfır sanılmaz. Sıfır, "çağrı oldu ama tur tamamlanmadı" demek.
    it("type alanı olmayan JSON satırlarında undefined", () => {
      expect(modelTurns('{"a":1}\n{"b":2}')).toBeUndefined();
    });
  });
});
