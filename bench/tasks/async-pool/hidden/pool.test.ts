// GİZLİ — üretici bu dosyayı hiç görmez. Yer gerçeği buradan gelir.
// Her `it` bloğu bir kusur kancasıdır: kırmızıysa kanıtlanmış bir hata var.
import { describe, expect, it, vi } from "vitest";
import { runPool } from "../artifact/src/pool.js";

/** Elle çözülen bir promise: zamanlayıcı değil, akış kontrolü. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Mikro-görev kuyruğunu boşaltır; "şu an kaç görev başlamış" ölçümü için. */
const settle = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

/**
 * `n` adet elle kontrol edilen görev. `started` hangi indislerin
 * çağrıldığını sırasıyla tutar, `live` o anki eşzamanlılıktır.
 */
function harness(n: number) {
  const gates = Array.from({ length: n }, () => deferred<number>());
  const started: number[] = [];
  let live = 0;
  let peak = 0;
  const tasks = gates.map((g, i) => async () => {
    started.push(i);
    live++;
    peak = Math.max(peak, live);
    try {
      return await g.promise;
    } finally {
      live--;
    }
  });
  return { tasks, gates, started, peak: () => peak };
}

describe("runPool", () => {
  it("sonuçları girdi sırasında döndürür", async () => {
    const h = harness(3);
    const p = runPool(h.tasks, 3);
    await settle();
    // Bitiş sırası tersine: sonuç sırası yine de girdi sırası olmalı.
    h.gates[2]!.resolve(20);
    h.gates[0]!.resolve(0);
    h.gates[1]!.resolve(10);
    await expect(p).resolves.toEqual([0, 10, 20]);
  });

  it("her görevi tam bir kez çağırır", async () => {
    const calls = [0, 0, 0];
    const tasks = calls.map((_, i) => vi.fn(async () => { calls[i]!++; return i; }));
    await runPool(tasks, 2);
    expect(calls).toEqual([1, 1, 1]);
  });

  // Havuzun tek işi bu: aşarsa "sınırlı eşzamanlılık" diye bir şey yok.
  it("aynı anda limitten fazla görev uçmaz", async () => {
    const h = harness(6);
    const p = runPool(h.tasks, 2);
    await settle();
    for (const g of h.gates) g.resolve(1);
    await p;
    expect(h.peak()).toBeLessThanOrEqual(2);
  });

  // Klasik kusur: tasks.map(t => t()) — hepsi anında başlar, limit süslemedir.
  it("görevleri tembel başlatır — başta yalnızca limit kadarı çağrılır", async () => {
    const h = harness(6);
    void runPool(h.tasks, 2);
    await settle();
    expect(h.started).toEqual([0, 1]);
  });

  it("slot boşalınca sıradaki görevi başlatır", async () => {
    const h = harness(4);
    void runPool(h.tasks, 2);
    await settle();
    h.gates[0]!.resolve(0);
    await settle();
    expect(h.started).toEqual([0, 1, 2]);
  });

  it("limit görev sayısından büyükse hepsini başlatır", async () => {
    const h = harness(3);
    void runPool(h.tasks, 10);
    await settle();
    expect(h.started).toEqual([0, 1, 2]);
  });

  it("boş görev listesiyle boş dizi döndürür", async () => {
    await expect(runPool([], 2)).resolves.toEqual([]);
  });

  it("bir görev reddederse O hatayla reddeder", async () => {
    const h = harness(3);
    const p = runPool(h.tasks, 2);
    await settle();
    h.gates[1]!.reject(new Error("ikinci"));
    h.gates[0]!.resolve(0);
    await expect(p).rejects.toThrow("ikinci");
  });

  // Klasik kusur: hata sonrası kuyruk beslenmeye devam eder; iptal yoktur.
  it("bir görev reddettikten sonra yeni görev başlatmaz", async () => {
    const h = harness(6);
    const p = runPool(h.tasks, 2);
    await settle();
    h.gates[0]!.reject(new Error("ilk"));
    h.gates[1]!.resolve(1);
    await expect(p).rejects.toThrow("ilk");
    await settle();
    expect(h.started).toEqual([0, 1]);
  });

  // Klasik kusur: ilk hatada hemen reddetmek. Çağıran "bitti" sanır,
  // oysa arkada hâlâ iş uçuyor — ve o iş de reddederse yakalayan kimse yok.
  it("reddetmeden önce uçmakta olan görevlerin bitmesini bekler", async () => {
    const h = harness(4);
    let ikinciBitti = false;
    const tasks = [
      h.tasks[0]!,
      async () => { const v = await h.gates[1]!.promise; ikinciBitti = true; return v; },
    ];
    const p = runPool(tasks, 2);
    await settle();
    h.gates[0]!.reject(new Error("ilk"));
    await settle();
    h.gates[1]!.resolve(1);
    await expect(p).rejects.toThrow("ilk");
    expect(ikinciBitti).toBe(true);
  });

  // Klasik kusur: thunk'ın senkron fırlatması. `t()` bir promise döndürmez,
  // doğrudan fırlatır; try/catch ile sarılmamışsa havuz kendi içinde patlar.
  it("senkron fırlatan bir görevi reddetme sayar", async () => {
    const tasks = [
      (() => { throw new Error("senkron"); }) as unknown as () => Promise<number>,
      async () => 1,
    ];
    await expect(runPool(tasks, 2)).rejects.toThrow("senkron");
  });

  // `Promise<T[]>` taahhüt eden bir imzada senkron fırlatmak, çağıranın
  // .catch(...) zincirini atlatır: yakalanmamış istisna.
  it("limit < 1 ise senkron fırlatmaz, reddeden promise döndürür", async () => {
    let result: unknown;
    expect(() => { result = runPool([async () => 1], 0); }).not.toThrow();
    await expect(result as Promise<unknown>).rejects.toThrow(RangeError);
  });
});
