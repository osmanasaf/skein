import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { knownProviderSet } from "../adapters/factory.js";
import { loadFlow } from "../flow/load.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { newCard, parseCard, serializeCard, rejectCount, CardError } from "./card.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function daily(): Promise<TopologySnapshot> {
  const flow = await loadFlow(join(repoRoot, "hub", "flows", "daily.yaml"), {
    root: repoRoot,
    providers: knownProviderSet(),
  });
  return snapshot(flow, repoRoot);
}

describe("newCard", () => {
  it("kartı zincirin başında, kuyrukta oluşturur", async () => {
    const card = newCard({ title: "Jitter ekle", task: "retry'a jitter ekle", topology: await daily() });

    expect(card.role).toBe("coder");
    expect(card.state).toBe("queued");
    expect(card.title).toBe("Jitter ekle");
    expect(card.rejects).toEqual({});
    expect(card.history).toEqual([
      { at: card.createdAt, event: "created", role: "coder" },
    ]);
  });

  it("topolojiyi ve hash'i karta gömer", async () => {
    const topology = await daily();
    const card = newCard({ title: "x", task: "y", topology });

    expect(card.topology.hash).toBe(topology.hash);
    expect(card.topology.roles.map((r) => r.id)).toEqual(["coder", "reviewer"]);
    // Canlı YAML değişse bile kart kendi yolunu bilir.
    expect(card.topology.roles[1]?.reject).toBe("coder");
  });

  it("id benzersiz ve okunabilir", async () => {
    const topology = await daily();
    const a = newCard({ title: "x", task: "y", topology });
    const b = newCard({ title: "x", task: "y", topology });

    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^c-\d{8}-[0-9a-f]{6}$/);
  });

  it("boş görev metni reddedilir", async () => {
    const topology = await daily();
    expect(() => newCard({ title: "x", task: "   ", topology })).toThrow(CardError);
  });
});

describe("parseCard / serializeCard", () => {
  it("gidiş dönüş kaybı yok", async () => {
    const card = newCard({ title: "Jitter", task: "iş", topology: await daily() });
    expect(parseCard(serializeCard(card))).toEqual(card);
  });

  it("serileştirme satır sonuyla biter — dosya olarak okunabilir dursun", async () => {
    const card = newCard({ title: "x", task: "y", topology: await daily() });
    expect(serializeCard(card).endsWith("\n")).toBe(true);
  });

  it("bilinmeyen üst düzey alan korunmaz ama reddedilmez de", async () => {
    const card = newCard({ title: "x", task: "y", topology: await daily() });
    const withExtra = JSON.stringify({ ...JSON.parse(serializeCard(card)), gelecek: 1 });
    expect(parseCard(withExtra).id).toBe(card.id);
  });

  it("eksik zorunlu alan reddedilir", async () => {
    const card = newCard({ title: "x", task: "y", topology: await daily() });
    const broken = JSON.parse(serializeCard(card)) as Record<string, unknown>;
    delete broken["role"];
    expect(() => parseCard(JSON.stringify(broken))).toThrow(/role/);
  });

  it("bilinmeyen durum reddedilir", async () => {
    const card = newCard({ title: "x", task: "y", topology: await daily() });
    const broken = { ...JSON.parse(serializeCard(card)), state: "uçtu" };
    expect(() => parseCard(JSON.stringify(broken))).toThrow(/state/);
  });

  it("geçersiz JSON reddedilir", () => {
    expect(() => parseCard("{ bu json değil")).toThrow(CardError);
  });

  // Kart durumun kendisi; bozuk bir kartı hoşgörmek geçmişi sessizce kaybetmek olur.
  it("geçmişi olmayan kart reddedilir", async () => {
    const card = newCard({ title: "x", task: "y", topology: await daily() });
    const broken = { ...JSON.parse(serializeCard(card)), history: [] };
    expect(() => parseCard(JSON.stringify(broken))).toThrow(/history/);
  });

  it("topolojisi olmayan kart reddedilir — yönlendirme oradan okunuyor", async () => {
    const card = newCard({ title: "x", task: "y", topology: await daily() });
    const broken = JSON.parse(serializeCard(card)) as Record<string, unknown>;
    delete broken["topology"];
    expect(() => parseCard(JSON.stringify(broken))).toThrow(/topology/);
  });
});

describe("rejectCount", () => {
  it("hiç ret yoksa sıfır", async () => {
    const card = newCard({ title: "x", task: "y", topology: await daily() });
    expect(rejectCount(card, "reviewer", "coder")).toBe(0);
  });

  it("kenar başına sayar", async () => {
    const card = newCard({ title: "x", task: "y", topology: await daily() });
    card.rejects["reviewer->coder"] = 2;
    expect(rejectCount(card, "reviewer", "coder")).toBe(2);
    expect(rejectCount(card, "coder", "reviewer")).toBe(0);
  });
});
