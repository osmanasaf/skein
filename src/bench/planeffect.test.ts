import { describe, expect, it } from "vitest";
import type { SkeinEvent } from "../events/log.js";
import { armRuns, planEffect } from "./planeffect.js";

const ev = (e: Record<string, unknown>, runId: string): SkeinEvent =>
  ({ v: 1, at: "2026-01-01T00:00:00.000Z", runId, ...e }) as SkeinEvent;

interface KosuSpec {
  red: number;
  model?: string;
  hooks?: number;
  ran?: boolean;
  activations?: number;
  rejects?: number;
  planning?: { objections: number; accepted: number; invalid: number };
}

/** Bir kol koşusunun günlüğü. */
function kosu(runId: string, taskId: string, arm: "planli" | "plansiz", s: KosuSpec): SkeinEvent[] {
  const hooks = s.hooks ?? 10;
  const out: SkeinEvent[] = [
    ev({ type: "ab.arm", taskId, arm, flow: `ab-${arm}`, model: s.model ?? "m1" }, runId),
  ];
  for (let i = 0; i < (s.activations ?? 2); i += 1) {
    out.push(ev({ type: "agent.finished", cell: `c${i}`, exitCode: 0, durationMs: 1, usage: { costUsd: 0.1 } }, runId));
  }
  for (let i = 0; i < (s.rejects ?? 0); i += 1) {
    out.push(ev({ type: "card.settled", cell: "c", card: "k", role: "reviewer", outcome: "rejected", state: "queued" }, runId));
  }
  if (s.planning !== undefined) {
    out.push(ev({
      type: "plan.settled", card: "k", role: "planner", outcome: "anlasma", rounds: 1,
      objections: s.planning.objections, accepted: s.planning.accepted, invalid: s.planning.invalid,
      path: "docs/plan/k.md", planHash: "h",
    }, runId));
  }
  out.push(ev({
    type: "hooks.measured", cell: `olcum/${arm}`, ran: s.ran ?? true, total: hooks,
    red: Array.from({ length: s.red }, (_, i) => `kanca-${i + 1}`),
  }, runId));
  return out;
}

/** Üç tekrar: kontrol kolu 4/10 kırmızı, planlı kol `planliRed`. */
const ucTekrar = (planliRed: number, taskId = "gorev-1", model = "m1"): SkeinEvent[] =>
  // Koşu kimliği göreve göre değişmeli: aynı kimlik iki görevde kullanılırsa
  // koşular tek koşu sanılır (ilk hâlinde tam bu oldu ve iki görev tek
  // gruba eridi).
  [1, 2, 3].flatMap((k) => [
    ...kosu(`${taskId}-${model}-p${k}`, taskId, "planli", { red: planliRed, model, activations: 4, planning: { objections: 1, accepted: 1, invalid: 0 } }),
    ...kosu(`${taskId}-${model}-s${k}`, taskId, "plansiz", { red: 4, model, activations: 2 }),
  ]);

describe("armRuns", () => {
  it("kol kimliğini `ab.arm` olayından okur ve sayıları toplar", () => {
    const runs = armRuns(kosu("r1", "g", "planli", { red: 2, activations: 4, rejects: 1, planning: { objections: 2, accepted: 1, invalid: 3 } }));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      arm: "planli", taskId: "g", ran: true, hooks: 10, red: 2,
      activations: 4, rejects: 1, planning: { rounds: 1, objections: 2, accepted: 1, invalid: 3 },
    });
    expect(runs[0]?.costUsd).toBeCloseTo(0.4);
  });

  // Kol, "plan olayı var mı" diye çıkarsanmıyor: planlayıcısı hiç koşmamış
  // bir planlı kol, kontrol kolu gibi görünürdü.
  it("plan olayı olmayan planlı koşuyu yine planlı sayar", () => {
    const runs = armRuns(kosu("r1", "g", "planli", { red: 1 }));
    expect(runs[0]?.arm).toBe("planli");
    expect(runs[0]?.planning).toBeUndefined();
  });
});

describe("planEffect", () => {
  it("eşiğin üstünde ve tutarlı azalma olumlu karardır", () => {
    const r = planEffect(ucTekrar(1));
    const g = r.groups[0];
    expect(g?.repeats).toBe(3);
    expect(g?.relativeReduction).toBeCloseTo(0.75);
    expect(g?.verdict.code).toBe("olumlu");
    expect(r.verdict.code).toBe("olumlu");
  });

  it("azalma yoksa olumsuz karardır", () => {
    const r = planEffect(ucTekrar(4));
    expect(r.groups[0]?.relativeReduction).toBe(0);
    expect(r.groups[0]?.verdict.code).toBe("olumsuz");
  });

  // k, İKİ kolun küçüğü: bir kolda üç, ötekinde bir koşu varsa elde üç
  // tekrar yok.
  it("kollardan biri eksikse k küçük olanı sayar ve karar vermez", () => {
    const r = planEffect([
      ...kosu("p1", "g", "planli", { red: 1 }),
      ...kosu("p2", "g", "planli", { red: 1 }),
      ...kosu("p3", "g", "planli", { red: 1 }),
      ...kosu("s1", "g", "plansiz", { red: 4 }),
    ]);
    expect(r.groups[0]?.repeats).toBe(1);
    expect(r.groups[0]?.verdict.code).toBe("yetersiz");
    expect(r.groups[0]?.verdict.reason).toMatch(/k=1/);
  });

  // ÖLÇÜLEMEDİ, "kusur yok" değil: o koşu paydaya girmez ve ayrı sayılır.
  it("ölçülemeyen koşuyu paydaya katmaz, ayrı sayar", () => {
    const r = planEffect([
      ...kosu("p1", "g", "planli", { red: 0, ran: false }),
      ...kosu("s1", "g", "plansiz", { red: 4 }),
    ]);
    expect(r.groups[0]?.planli?.runs).toBe(0);
    expect(r.groups[0]?.planli?.unmeasured).toBe(1);
    expect(r.groups[0]?.verdict.code).toBe("yetersiz");
  });

  it("kontrol kolunda kusur yoksa azalma tanımsızdır", () => {
    const r = planEffect([
      ...[1, 2, 3].flatMap((k) => kosu(`p${k}`, "g", "planli", { red: 0 })),
      ...[1, 2, 3].flatMap((k) => kosu(`s${k}`, "g", "plansiz", { red: 0 })),
    ]);
    expect(r.groups[0]?.relativeReduction).toBeNull();
    expect(r.groups[0]?.verdict.reason).toMatch(/tanımsız/);
  });

  it("tekrarlar arasında işaret tutarsızsa olumlu demez", () => {
    const r = planEffect([
      ...kosu("p1", "g", "planli", { red: 1 }), ...kosu("s1", "g", "plansiz", { red: 8 }),
      ...kosu("p2", "g", "planli", { red: 1 }), ...kosu("s2", "g", "plansiz", { red: 6 }),
      ...kosu("p3", "g", "planli", { red: 5 }), ...kosu("s3", "g", "plansiz", { red: 2 }),
    ]);
    expect(r.groups[0]?.relativeReduction).toBeGreaterThan(0.2);
    expect(r.groups[0]?.verdict.code).toBe("belirsiz");
    expect(r.groups[0]?.verdict.reason).toMatch(/tutarsız/);
  });

  // Alışverişin töreni ayrı sayılıyor: itiraz hiç çıkmıyorsa mekanizma
  // ikinci bir çift göz olabilir ama itiraz üretmiyor.
  it("itirazsız alışverişleri ve kabul oranını sayar", () => {
    const r = planEffect([
      ...kosu("p1", "g", "planli", { red: 1, planning: { objections: 0, accepted: 0, invalid: 0 } }),
      ...kosu("p2", "g", "planli", { red: 1, planning: { objections: 2, accepted: 1, invalid: 1 } }),
      ...kosu("s1", "g", "plansiz", { red: 4 }),
    ]);
    expect(r.groups[0]?.ceremony).toEqual({
      exchanges: 2, withoutObjection: 1, objections: 2, accepted: 1, invalid: 1,
    });
  });

  it("görevler ayrışırsa havuzda eritmez", () => {
    const r = planEffect([...ucTekrar(1, "iyi"), ...ucTekrar(4, "kotu")]);
    expect(r.verdict.code).toBe("belirsiz");
    expect(r.verdict.reason).toMatch(/ayrışıyor/);
  });

  it("aktivasyon ve maliyet farkını kaydeder", () => {
    const g = planEffect(ucTekrar(1)).groups[0];
    expect(g?.planli?.activations).toBe(12);
    expect(g?.plansiz?.activations).toBe(6);
  });
});

// Grup = görev × MODEL KURGUSU. Bu kural `effect.ts`'te bir kez konuldu
// (k-şişmesi düzeltmesi) ve `planeffect.ts`'te UNUTULDU; canlı kampanyada
// yakalandı: aynı görev önce sonnet sonra haiku ile koşulduğunda rapor
// ikisini tek hücre sanıyordu.
describe("planEffect — grup anahtarı görev × model", () => {
  it("aynı görevin iki modeli AYRI gruplara düşer", () => {
    const r = planEffect([...ucTekrar(1, "gorev-1", "sonnet"), ...ucTekrar(4, "gorev-1", "haiku")]);
    expect(r.groups).toHaveLength(2);
    expect(r.groups.map((g) => [g.taskId, g.model, g.repeats])).toEqual(
      expect.arrayContaining([["gorev-1", "sonnet", 3], ["gorev-1", "haiku", 3]]),
    );
  });

  it("modelleri karıştırmak k'yı şişirmez", () => {
    // Her modelde BİR tekrar: elde iki ayrı k=1 var, k=2 yok.
    const bir = (model: string) => [
      ...kosu(`g-${model}-p1`, "gorev-1", "planli", { red: 1, model, activations: 4 }),
      ...kosu(`g-${model}-s1`, "gorev-1", "plansiz", { red: 4, model, activations: 2 }),
    ];
    const r = planEffect([...bir("sonnet"), ...bir("haiku")]);
    expect(r.groups.map((g) => g.repeats)).toEqual([1, 1]);
    expect(r.verdict.code).toBe("yetersiz");
    expect(r.verdict.reason).toMatch(/k=1/);
  });

  // Eski günlüklerde alan yok; onları yeni bir modelin grubuna karıştırmak
  // tam olarak bu düzeltmenin önlediği şey olurdu.
  it("modeli yazılmamış eski koşular ayrı bir gruba düşer", () => {
    const eski = [
      ev({ type: "ab.arm", taskId: "gorev-1", arm: "plansiz", flow: "ab-plansiz" }, "eski-1"),
      ev({ type: "hooks.measured", cell: "olcum/plansiz", ran: true, total: 10, red: ["k1"] }, "eski-1"),
    ];
    const r = planEffect([...eski, ...ucTekrar(1, "gorev-1", "sonnet")]);
    expect(r.groups.map((g) => g.model).sort()).toEqual(["(bilinmiyor)", "sonnet"]);
  });
});

// Rapor operatörün para harcama kararını besliyor; yanlış teşhis pahalı.
// İlk hâlinde `relative === null`'un üç sebebi tek mesaja eriyordu ve
// kampanya sırasında rapor, kontrol kolunda 2 kırmızı kanca gösterirken
// "kontrol kolunda hiç kırmızı kanca yok" diyordu.
describe("planEffect — ölçülemezliğin sebebi doğru söylenir", () => {
  it("deney kolu ölçülmediyse kontrol kolunu suçlamaz", () => {
    const r = planEffect([
      ...kosu("s1", "g", "plansiz", { red: 2, hooks: 16 }),
      ...kosu("p1", "g", "planli", { red: 0, hooks: 16, ran: false }),
    ]);
    expect(r.verdict.reason).toMatch(/Deney kolu ölçülmedi \(1 kol düştü\)/);
    expect(r.verdict.reason).not.toMatch(/kırmızı kanca yok/);
  });

  it("kontrol kolu temizse onu söyler", () => {
    const r = planEffect([
      ...kosu("s1", "g", "plansiz", { red: 0, hooks: 16 }),
      ...kosu("p1", "g", "planli", { red: 0, hooks: 16 }),
    ]);
    expect(r.verdict.reason).toMatch(/Kontrol kolunda hiç kırmızı kanca yok/);
  });

  it("kontrol kolu hiç koşmadıysa onu söyler", () => {
    const r = planEffect([...kosu("p1", "g", "planli", { red: 0, hooks: 16 })]);
    expect(r.verdict.reason).toMatch(/Kontrol kolu ölçülmedi/);
  });
});
