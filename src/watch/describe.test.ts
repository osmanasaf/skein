import { describe, expect, it } from "vitest";
import type { Card, HistoryEntry } from "../card/card.js";
import type { TopologySnapshot } from "../flow/snapshot.js";
import type { TickResult } from "./tick.js";
import { describeTick } from "./describe.js";

/** `describeTick` topolojinin içeriğine bakmıyor; sadece tipi doldurmak için. */
const TOPOLOGY: TopologySnapshot = {
  flow: "test",
  hash: "deadbeef",
  roles: [
    { id: "coder", provider: "claude", workspace: "main", prompt: "p", receive: "task", next: "reviewer", syncBack: [], reject: null },
  ],
  gates: [],
  reject: { limit: 2, onExhausted: "gate" },
  audit: { enabled: false, fingerprint: [] },
  constitution: [],
};

function card(history: HistoryEntry[], overrides: Partial<Card> = {}): Card {
  return {
    id: "c-20260918-000001",
    title: "başlık",
    task: "iş",
    createdAt: "2026-09-18T00:00:00.000Z",
    role: "reviewer",
    state: "active",
    rejects: {},
    history,
    topology: TOPOLOGY,
    ...overrides,
  };
}

describe("describeTick", () => {
  it("sıradan bir kabulde tur bilgisi göstermez", () => {
    const c = card([
      { at: "t0", event: "created", role: "coder" },
      { at: "t1", event: "taken", role: "coder" },
      { at: "t2", event: "handoff", from: "coder", to: "reviewer" },
    ]);
    const result: TickResult = { status: "accepted", card: c };
    expect(describeTick("coder", result)).not.toMatch(/planlama/);
  });

  it("plan yazma turundan sonraki kabulde 'tur 0' gösterir", () => {
    const c = card([
      { at: "t0", event: "created", role: "coder" },
      { at: "t1", event: "taken", role: "coder" },
      { at: "t2", event: "plan", role: "coder", action: "yazdi", round: 0 },
    ]);
    const result: TickResult = { status: "accepted", card: c };
    expect(describeTick("coder", result)).toContain("(planlama: plan yazıldı)");
  });

  it("itiraz turundan sonraki kabulde 'tur 1' gösterir (yazdi'yle karışmaz)", () => {
    const c = card([
      { at: "t0", event: "created", role: "coder" },
      { at: "t1", event: "taken", role: "reviewer" },
      { at: "t2", event: "plan", role: "reviewer", action: "itiraz", round: 1 },
    ]);
    const result: TickResult = { status: "accepted", card: c };
    const line = describeTick("reviewer", result);
    expect(line).toContain("(planlama, tur 1)");
    expect(line).not.toContain("tur 0");
  });

  it("kilit (deadlock) kapısında, plan kaydı gate'ten hemen önce ise turu gösterir", () => {
    const c = card(
      [
        { at: "t0", event: "created", role: "coder" },
        { at: "t1", event: "taken", role: "coder" },
        { at: "t2", event: "plan", role: "coder", action: "cevap", round: 1 },
        { at: "t3", event: "gate", role: "coder", reason: "tur doldu", kind: "deadlock" },
      ],
      { state: "gate" },
    );
    const result: TickResult = { status: "escalated", card: c, reason: "tur doldu" };
    expect(describeTick("coder", result)).toContain("(planlama, tur 1)");
  });

  it("eski bir plan kaydı, aradan taken geçtikten sonraki sonraki gate'te YANLIŞLIKLA görünmez", () => {
    // Planlama bir tur önce bitmiş (sonra rolüne geçmiş); bu kartın ÇOK
    // SONRA, alakasız bir geçişinde `taken` → (ör. zaman aşımı) → `gate`
    // sırası oluşmuş. Son kayıt `gate`, ondan önceki kayıt `plan` DEĞİL —
    // `lastPlanEntry` burada yanlış pozitif üretirdi, `thisTurnPlanEntry`
    // üretmemeli.
    const c = card(
      [
        { at: "t0", event: "created", role: "coder" },
        { at: "t1", event: "taken", role: "coder" },
        { at: "t2", event: "plan", role: "coder", action: "cevap", round: 1 },
        { at: "t3", event: "taken", role: "sonra" },
        { at: "t4", event: "gate", role: "sonra", reason: "zaman aşımı", kind: "escalation" },
      ],
      { state: "gate" },
    );
    const result: TickResult = { status: "escalated", card: c, reason: "zaman aşımı" };
    expect(describeTick("sonra", result)).not.toMatch(/planlama/);
  });

  it("ret (rejected) turunda planlama bilgisi hiç gösterilmez", () => {
    const c = card(
      [
        { at: "t0", event: "created", role: "coder" },
        { at: "t1", event: "taken", role: "reviewer" },
        { at: "t2", event: "reject", from: "reviewer", to: "coder", round: 1, reason: "eksik test" },
      ],
      { role: "coder", state: "queued" },
    );
    const result: TickResult = { status: "rejected", card: c, reason: "eksik test" };
    expect(describeTick("reviewer", result)).not.toMatch(/planlama/);
  });
});
