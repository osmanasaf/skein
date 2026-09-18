// GİZLİ — üretici bu dosyayı hiç görmez. Yer gerçeği buradan gelir.
// Her `it` bloğu bir kusur kancasıdır: kırmızıysa kanıtlanmış bir hata var.
import { beforeEach, describe, expect, it } from "vitest";
import { Outbox } from "../artifact/src/outbox.js";
import { resetIds } from "../artifact/src/ids.js";
import type { Mesaj, Sink } from "../artifact/src/sink.js";

/**
 * Gerçek taşıyıcı gibi davranan taklit: kimliğe göre tekilleştirir, yani
 * aynı kimlik ikinci kez gelirse karşı tarafa YENİ bir teslim olmaz.
 * `plan` her çağrı için ne olacağını söyler: "ok", "hata" (teslim yok),
 * "kayipOnay" (teslim var, sonra reddediyor).
 */
function sahteSink(plan: ("ok" | "hata" | "kayipOnay")[] = []): Sink & {
  cagrilar: Mesaj[];
  teslimler: string[];
} {
  const gorulen = new Set<string>();
  const teslimler: string[] = [];
  const cagrilar: Mesaj[] = [];
  let i = 0;
  return {
    cagrilar,
    teslimler,
    async send(mesaj) {
      cagrilar.push(mesaj);
      const ne = plan[i] ?? "ok";
      i += 1;
      if (ne !== "hata" && !gorulen.has(mesaj.id)) {
        gorulen.add(mesaj.id);
        teslimler.push(mesaj.govde);
      }
      if (ne !== "ok") throw new Error("gönderim başarısız");
    },
  };
}

beforeEach(() => {
  resetIds();
});

describe("flush — temel davranış", () => {
  it("bekleyen mesajları kuyruk sırasıyla gönderir", async () => {
    const sink = sahteSink();
    const o = new Outbox(sink);
    o.enqueue("bir");
    o.enqueue("iki");
    await o.flush();
    expect(sink.cagrilar.map((m) => m.govde)).toEqual(["bir", "iki"]);
  });

  it("teslim edilen mesaj kuyruktan çıkar", async () => {
    const o = new Outbox(sahteSink());
    o.enqueue("bir");
    await o.flush();
    expect(o.bekleyenSayisi).toBe(0);
  });

  it("teslim edilen sayısını döndürür", async () => {
    const o = new Outbox(sahteSink());
    o.enqueue("bir");
    o.enqueue("iki");
    expect(await o.flush()).toBe(2);
  });

  it("boş kuyrukta taşıyıcıyı çağırmaz ve 0 döner", async () => {
    const sink = sahteSink();
    const o = new Outbox(sink);
    expect(await o.flush()).toBe(0);
    expect(sink.cagrilar).toHaveLength(0);
  });

  it("başarısız mesaj kuyrukta kalır", async () => {
    const o = new Outbox(sahteSink(["hata", "hata", "hata"]));
    o.enqueue("bir");
    expect(await o.flush()).toBe(0);
    expect(o.pending().map((m) => m.govde)).toEqual(["bir"]);
  });

  it("denemeleri tükenen mesaj kuyrukta tek kez durur", async () => {
    const o = new Outbox(sahteSink(["hata", "hata", "hata"]));
    o.enqueue("bir");
    await o.flush();
    expect(o.bekleyenSayisi).toBe(1);
  });

  it("verilen deneme sayısı kadar dener", async () => {
    const sink = sahteSink(["hata", "hata", "hata", "hata", "hata"]);
    const o = new Outbox(sink);
    o.enqueue("bir");
    await o.flush(2);
    expect(sink.cagrilar).toHaveLength(2);
  });

  it("geçici hatadan sonra teslim edebilir", async () => {
    const sink = sahteSink(["hata", "ok"]);
    const o = new Outbox(sink);
    o.enqueue("bir");
    expect(await o.flush()).toBe(1);
    expect(o.bekleyenSayisi).toBe(0);
  });

  it("başarısız mesaj sonrakileri engellemez", async () => {
    const sink = sahteSink(["hata", "hata", "hata", "ok"]);
    const o = new Outbox(sink);
    o.enqueue("bir");
    o.enqueue("iki");
    expect(await o.flush()).toBe(1);
    expect(o.pending().map((m) => m.govde)).toEqual(["bir"]);
    expect(sink.teslimler).toEqual(["iki"]);
  });

  it("kalanların kuyruk sırası korunur", async () => {
    const sink = sahteSink(["hata", "hata", "hata", "ok", "hata", "hata", "hata"]);
    const o = new Outbox(sink);
    o.enqueue("bir");
    o.enqueue("iki");
    o.enqueue("uc");
    await o.flush();
    expect(o.pending().map((m) => m.govde)).toEqual(["bir", "uc"]);
  });
});

describe("kimlik — taşıyıcı kimliğe göre tekilleştiriyor", () => {
  // `sink.ts`: aynı kimlikle ikinci gönderim yok sayılır, FARKLI kimlikle
  // aynı gövde iki kez teslim edilir. Yani yeniden deneme aynı kimlikle
  // yapılmazsa karşı taraf mesajı iki kez alır.
  it("yeniden deneme aynı kimlikle yapılır", async () => {
    const sink = sahteSink(["hata", "ok"]);
    const o = new Outbox(sink);
    o.enqueue("bir");
    await o.flush();
    expect(sink.cagrilar).toHaveLength(2);
    expect(sink.cagrilar[0]?.id).toBe(sink.cagrilar[1]?.id);
  });

  // Onayın kaybolduğu durum: taşıyıcı teslim etti ama reddetti. Tekrar
  // gönderim aynı kimlikleyse karşı taraf mesajı tek kez alır.
  it("kaybolan onaydan sonra gövde karşı tarafa tek kez teslim edilir", async () => {
    const sink = sahteSink(["kayipOnay", "ok"]);
    const o = new Outbox(sink);
    o.enqueue("bir");
    await o.flush();
    expect(sink.teslimler).toEqual(["bir"]);
  });

  it("denemeleri tükenen mesaj kimliğini korur", async () => {
    const o = new Outbox(sahteSink(["hata", "hata", "hata"]));
    const id = o.enqueue("bir");
    await o.flush();
    expect(o.pending()[0]?.id).toBe(id);
  });

  it("iki flush arasında kimlik değişmez", async () => {
    const sink = sahteSink(["hata", "hata", "hata", "hata", "ok"]);
    const o = new Outbox(sink);
    const id = o.enqueue("bir");
    await o.flush();
    await o.flush(2);
    expect(sink.cagrilar.every((m) => m.id === id)).toBe(true);
    expect(sink.teslimler).toEqual(["bir"]);
  });

  // Kimlik üreteci koştuysa sayaç ilerler; sonraki enqueue bunu ele verir.
  it("flush yeni kimlik üretmez", async () => {
    const o = new Outbox(sahteSink(["hata", "hata", "hata"]));
    o.enqueue("bir");
    await o.flush();
    expect(o.enqueue("iki")).toBe("m-2");
  });
});

describe("mevcut sözleşme", () => {
  it("pending kopya döndürmeye devam eder", async () => {
    const o = new Outbox(sahteSink(["hata", "hata", "hata"]));
    o.enqueue("bir");
    const kopya = o.pending() as Mesaj[];
    kopya.length = 0;
    expect(o.bekleyenSayisi).toBe(1);
  });

  it("enqueue artan kimlikler vermeye devam eder", () => {
    const o = new Outbox(sahteSink());
    expect(o.enqueue("bir")).toBe("m-1");
    expect(o.enqueue("iki")).toBe("m-2");
  });
});
