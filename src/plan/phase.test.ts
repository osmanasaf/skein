import { describe, expect, it } from "vitest";
import { newCard, type Card, type HistoryEntry } from "../card/card.js";
import type { TopologySnapshot } from "../flow/snapshot.js";
import { objectionBaseline, planPhase } from "./phase.js";

/**
 * Üç katılımcılı topoloji, elle kurulmuş.
 *
 * `loadFlow`'dan geçmiyor çünkü sınanan şey yükleyici değil, turun SIRASI.
 * Bu dosya diske hiç dokunmuyor: aşama makinesi saf ve öyle kalmalı.
 */
const topology = (tur: number, katilimcilar = ["planner", "architect", "analyst"]): TopologySnapshot => ({
  flow: "t",
  hash: "h",
  roles: [
    { id: "planner", provider: "claude", workspace: "main", prompt: "p", receive: "task", next: "architect", syncBack: [], reject: null },
    { id: "architect", provider: "claude", workspace: "architect", prompt: "a", receive: "batch", next: "analyst", syncBack: [], reject: null },
    { id: "analyst", provider: "claude", workspace: "analyst", prompt: "n", receive: "batch", next: "coder", syncBack: [], reject: null },
    { id: "coder", provider: "claude", workspace: "coder", prompt: "c", receive: "batch", next: "done", syncBack: [], reject: null },
  ],
  gates: [],
  reject: { limit: 2, onExhausted: "gate" },
  audit: { enabled: false, fingerprint: [] },
  constitution: [],
  plan: {
    katilimcilar, plan: "docs/plan/{kart}.md",
    itiraz: "docs/plan/{kart}.itiraz.{rol}.md", tur, ilkTurKor: true,
  },
});

const card = (topo: TopologySnapshot, ...history: HistoryEntry[]): Card => {
  const base = newCard({ title: "i", task: "t", topology: topo });
  return { ...base, history: [...base.history, ...history] };
};

const plan = (
  role: string, action: "yazdi" | "itiraz" | "cevap", round: number, objections?: number,
): HistoryEntry => ({
  at: "2026-01-01T00:00:00.000Z", event: "plan", role, action, round,
  ...(objections === undefined ? {} : { objections }),
});

/**
 * ALIŞVERİŞ KAPANDIKTAN SONRA — ölçülmüş kusur.
 *
 * Eski kod yalnızca son plan kaydına bakıyordu. Alışveriş doğal sonla
 * biter, kart `coder`'a gider, `coder` KODLA ilgili bir sebepten reddeder
 * ve `reject: planner` kenarıyla yazara döner — `planPhase` o noktada
 * hâlâ "itirazları yanıtla" diyordu. `tick`'in cevap turu koşuyor, plan
 * dosyası değişmediği için kart "KABUL etti ama planı değiştirmedi"
 * gerekçesiyle insan kapısına çıkıyor ve reddin gerçek sebebi hiç ele
 * alınmıyor: operatöre tamamen yanlış teşhis gidiyor.
 */
describe("planPhase — alışveriş kapandıktan sonra", () => {
  const t = topology(2);
  const taken = (role: string): HistoryEntry =>
    ({ at: "2026-01-01T00:00:00.000Z", event: "taken", role });
  const ret = (from: string, to: string): HistoryEntry =>
    ({ at: "2026-01-01T00:00:00.000Z", event: "reject", from, to, round: 1, reason: "testler kırık" });

  it("kod reti yazara dönünce cevap turu AÇILMAZ", () => {
    const c = card(t,
      plan("planner", "yazdi", 0),
      plan("architect", "itiraz", 1, 1),
      plan("analyst", "itiraz", 1, 1),
      plan("planner", "cevap", 1, 1),
      plan("architect", "itiraz", 2, 1),
      plan("analyst", "itiraz", 2, 1),
      // Doğal son: kart `coder`'a gitti, `coder` aldı ve reddetti.
      taken("coder"),
      ret("coder", "planner"),
    );
    expect(planPhase(c, "planner", t)).toEqual({ kind: "yok" });
  });

  it("kod reti ilk itirazcıya dönünce itiraz turu AÇILMAZ", () => {
    const c = card(t,
      plan("planner", "yazdi", 0),
      plan("architect", "itiraz", 1, 1),
      plan("analyst", "itiraz", 1, 1),
      plan("planner", "cevap", 1, 1),
      taken("coder"),
      ret("coder", "architect"),
    );
    expect(planPhase(c, "architect", t)).toEqual({ kind: "yok" });
  });

  // Alışveriş İÇİNDE taşıma yalnızca `plan` kaydı bırakıyor, yani kapı
  // yürüyen alışverişi kesmemeli.
  it("alışveriş yürürken sıra bozulmuyor", () => {
    const c = card(t,
      plan("planner", "yazdi", 0),
      plan("architect", "itiraz", 1, 1),
    );
    expect(planPhase(c, "analyst", t)).toEqual({ kind: "itiraz", round: 1 });
  });

  // Katılımcının kendi `taken` kaydı alışverişi kapatmamalı: gözcü her
  // turda kartı alıyor.
  it("katılımcının taken kaydı alışverişi kapatmıyor", () => {
    const c = card(t,
      plan("planner", "yazdi", 0),
      taken("architect"),
    );
    expect(planPhase(c, "architect", t)).toEqual({ kind: "itiraz", round: 1 });
  });
});

describe("planPhase — turun sırası", () => {
  const t = topology(2);

  it("plan yazılmadan yazar yazma turunda, itirazcılar sırada değil", () => {
    const c = card(t);
    expect(planPhase(c, "planner", t)).toEqual({ kind: "yaz" });
    expect(planPhase(c, "architect", t)).toEqual({ kind: "yok" });
    expect(planPhase(c, "analyst", t)).toEqual({ kind: "yok" });
  });

  it("plan yazıldıysa söz İLK itirazcıda", () => {
    const c = card(t, plan("planner", "yazdi", 0));
    expect(planPhase(c, "architect", t)).toEqual({ kind: "itiraz", round: 1 });
    // İkinci itirazcı sırasını beklemek zorunda: ikisi aynı anda koşarsa
    // aynı dosyaya iki ajan yazar.
    expect(planPhase(c, "analyst", t)).toEqual({ kind: "yok" });
    expect(planPhase(c, "planner", t)).toEqual({ kind: "yok" });
  });

  it("ilk itirazcıdan sonra söz İKİNCİ itirazcıda, yazarda değil", () => {
    const c = card(t, plan("planner", "yazdi", 0), plan("architect", "itiraz", 1, 1));
    expect(planPhase(c, "analyst", t)).toEqual({ kind: "itiraz", round: 1 });
    expect(planPhase(c, "planner", t)).toEqual({ kind: "yok" });
  });

  it("son itirazcıdan sonra yanıt sırası yazarda", () => {
    const c = card(t,
      plan("planner", "yazdi", 0), plan("architect", "itiraz", 1, 1), plan("analyst", "itiraz", 1, 2));
    expect(planPhase(c, "planner", t)).toEqual({ kind: "cevap", round: 1 });
    expect(planPhase(c, "architect", t)).toEqual({ kind: "yok" });
  });

  it("yanıttan sonra tavan dolmadıysa yeni tur, ilk itirazcıdan başlar", () => {
    const c = card(t,
      plan("planner", "yazdi", 0), plan("architect", "itiraz", 1, 1),
      plan("analyst", "itiraz", 1, 2), plan("planner", "cevap", 1, 2));
    expect(planPhase(c, "architect", t)).toEqual({ kind: "itiraz", round: 2 });
    expect(planPhase(c, "analyst", t)).toEqual({ kind: "yok" });
  });

  it("tavan dolduysa kimsenin turu yok — alışveriş kapandı", () => {
    const tek = topology(1);
    const c = card(tek,
      plan("planner", "yazdi", 0), plan("architect", "itiraz", 1, 1),
      plan("analyst", "itiraz", 1, 2), plan("planner", "cevap", 1, 2));
    for (const rol of ["planner", "architect", "analyst", "coder"]) {
      expect(planPhase(c, rol, tek)).toEqual({ kind: "yok" });
    }
  });

  it("katılımcı olmayan rol hiçbir turda yok", () => {
    const c = card(t, plan("planner", "yazdi", 0));
    expect(planPhase(c, "coder", t)).toEqual({ kind: "yok" });
  });

  // Topolojide olmayan bir rolün itirazı: sıra hesaplanamıyor. Sessizce
  // başa dönmek itirazcıları sonsuz döndürürdü.
  it("tanınmayan rolün itirazından sonra alışveriş ilerlemez", () => {
    const c = card(t, plan("planner", "yazdi", 0), plan("yabanci", "itiraz", 1, 1));
    for (const rol of ["planner", "architect", "analyst"]) {
      expect(planPhase(c, rol, t)).toEqual({ kind: "yok" });
    }
  });
});

describe("planPhase — insan kapıdan yeniden açarsa", () => {
  const t = topology(1);
  const kapi = (role: string): HistoryEntry =>
    ({ at: "2026-01-01T00:01:00.000Z", event: "gate", role, reason: "kilit", kind: "deadlock" });
  const birakildi = (role: string): HistoryEntry =>
    ({ at: "2026-01-01T00:02:00.000Z", event: "released", role });

  it("retry yazarı AYNI cevap turuna geri koyar — tavan dolmuş olsa bile", () => {
    const c = card(t,
      plan("planner", "yazdi", 0), plan("architect", "itiraz", 1, 1),
      plan("analyst", "itiraz", 1, 2), plan("planner", "cevap", 1, 2),
      kapi("planner"), birakildi("planner"));
    expect(planPhase(c, "planner", t)).toEqual({ kind: "cevap", round: 1 });
    // Sıra ilerlemiyor: insanın "bunu düzelt" dediği tur atlanmaz.
    expect(planPhase(c, "architect", t)).toEqual({ kind: "yok" });
  });

  it("retry itirazcıyı AYNI itiraz turuna geri koyar", () => {
    const c = card(t,
      plan("planner", "yazdi", 0), plan("architect", "itiraz", 1, 1),
      kapi("architect"), birakildi("architect"));
    expect(planPhase(c, "architect", t)).toEqual({ kind: "itiraz", round: 1 });
    expect(planPhase(c, "analyst", t)).toEqual({ kind: "yok" });
  });

  // Bu, kendi işime saldırgan bakınca çıkan kusur. Gevşek bir tarama
  // (plan kaydından sonraki İLK kapı + bırakma) zincirin İLERİSİNDEN gelen
  // bir `back` kararını da "plan yeniden açıldı" sayıyordu: coder kaçış
  // kapısına çıkar, insan `back` der, hedef ret hedefi — yani planı yazan
  // rol. O kart plan için dönmüyor; kodla ilgili bir sebepten dönüyor.
  it("zincirin ilerisinden gelen `back` kararı planı yeniden AÇMAZ", () => {
    const c = card(t,
      plan("planner", "yazdi", 0), plan("architect", "itiraz", 1, 1),
      plan("analyst", "itiraz", 1, 2), plan("planner", "cevap", 1, 2),
      // Alışveriş kapandı, kart zincirden devam etti, coder kapıya çıktı.
      { at: "t5", event: "taken", role: "coder" },
      kapi("coder"), birakildi("planner"));
    // Yazar sıradan rol turunu koşar; "itirazları yanıtla" turu almaz.
    expect(planPhase(c, "planner", t)).toEqual({ kind: "yok" });
  });

  // `forward`: insan "planı olduğu gibi kabul ediyorum" dedi. Kart
  // alışverişten sonraki role gitti; alışveriş YENİDEN AÇILMAZ.
  it("ileri bırakma alışverişi yeniden açmaz", () => {
    const c = card(t,
      plan("planner", "yazdi", 0), plan("architect", "itiraz", 1, 1),
      plan("analyst", "itiraz", 1, 2), plan("planner", "cevap", 1, 2),
      kapi("planner"), birakildi("coder"));
    for (const rol of ["planner", "architect", "analyst"]) {
      expect(planPhase(c, rol, t)).toEqual({ kind: "yok" });
    }
  });
});

describe("objectionBaseline", () => {
  const t = topology(3);

  it("ilk turun tabanı sıfır", () => {
    const c = card(t, plan("planner", "yazdi", 0));
    expect(objectionBaseline(c, 1)).toBe(0);
  });

  it("tur başındaki taban ÖNCEKİ turun son sayısı", () => {
    const c = card(t,
      plan("planner", "yazdi", 0), plan("architect", "itiraz", 1, 1),
      plan("analyst", "itiraz", 1, 2), plan("planner", "cevap", 1, 2),
      plan("architect", "itiraz", 2, 3));
    expect(objectionBaseline(c, 2)).toBe(2);
    // Aynı turun kendi kayıtları tabana girmez; yoksa "bu turda yeni
    // itiraz var mı" sorusu kendi cevabını yer.
    expect(objectionBaseline(c, 3)).toBe(3);
  });

  it("sayı yazmamış kayıtlar atlanır", () => {
    const c = card(t, plan("planner", "yazdi", 0), plan("architect", "itiraz", 1));
    expect(objectionBaseline(c, 2)).toBe(0);
  });
});
