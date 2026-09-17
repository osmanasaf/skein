import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { newCard } from "../card/card.js";
import { CardQueue } from "../card/queue.js";
import { loadFlow } from "../flow/load.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { serveUi, type UiServer } from "./server.js";

const FLOW = `
name: test
constitution:
  - ../prompts/base.md
roles:
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: done
`;

let root: string;
let queue: CardQueue;
let topology: TopologySnapshot;
let server: UiServer;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "skein-uisrv-"));
  await mkdir(join(root, "hub", "flows"), { recursive: true });
  await mkdir(join(root, "hub", "prompts"), { recursive: true });
  await mkdir(join(root, "roles"), { recursive: true });
  await writeFile(join(root, "hub", "prompts", "base.md"), "# Anayasa\n");
  await writeFile(join(root, "roles", "coder.prompt"), "# coder\n");
  await writeFile(join(root, "hub", "flows", "test.yaml"), FLOW);

  queue = new CardQueue(join(root, ".skein"));
  await queue.init();
  const flow = await loadFlow(join(root, "hub", "flows", "test.yaml"), {
    root,
    providers: knownProviderSet(),
  });
  topology = snapshot(flow, root);
  server = await serveUi({ root, queue, topology, flowName: flow.name, flowHash: flow.hash });
});
afterEach(async () => {
  await server.close();
  await rm(root, { recursive: true, force: true });
});

describe("serveUi", () => {
  it("sayfayı verir", async () => {
    const res = await fetch(server.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("<title>Skein</title>");
  });

  it("durumu JSON olarak verir", async () => {
    await queue.add(newCard({ title: "jitter", task: "iş", topology }));

    const res = await fetch(`${server.url}durum`);
    const model = (await res.json()) as { cards: { title: string }[]; roles: { id: string }[] };

    expect(res.status).toBe(200);
    expect(model.roles.map((r) => r.id)).toEqual(["coder"]);
    expect(model.cards[0]?.title).toBe("jitter");
  });

  // Model her saniye değişiyor; bayat cevap ekranı yalan söyletir.
  it("durum önbelleğe alınmaz", async () => {
    const res = await fetch(`${server.url}durum`);
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  // Bu yüzey OKUR. Yazma adım 4 ve komut olarak gelecek.
  it("GET dışındaki yöntemleri reddeder", async () => {
    const res = await fetch(`${server.url}durum`, { method: "POST" });
    expect(res.status).toBe(405);
  });

  it("kart detayını verir", async () => {
    const card = await queue.add(newCard({ title: "jitter", task: "iş", topology }));

    const res = await fetch(`${server.url}kart/${card.id}`);
    const detail = (await res.json()) as { card: { id: string }; history: { event: string }[] };

    expect(res.status).toBe(200);
    expect(detail.card.id).toBe(card.id);
    expect(detail.history[0]?.event).toBe("created");
  });

  it("olmayan kart 404", async () => {
    expect((await fetch(`${server.url}kart/c-yok`)).status).toBe(404);
  });

  it("bilinmeyen yol 404", async () => {
    expect((await fetch(`${server.url}yok`)).status).toBe(404);
  });

  // Bozuk bir kart dosyası ekranı çökertmemeli.
  it("okuma hatasını 500 ve gerekçeyle bildirir", async () => {
    // Rol dizinleri tembel oluşuyor; kartı elle koymak için önce dizin.
    await mkdir(join(root, ".skein", "queue", "coder"), { recursive: true });
    await writeFile(join(root, ".skein", "queue", "coder", "0-bozuk.json"), "{ yarım");

    const res = await fetch(`${server.url}durum`);

    expect(res.status).toBe(500);
    expect((await res.json()) as { hata: string }).toHaveProperty("hata");
  });

  it("varsayılan olarak yalnızca yerel arayüzü dinler", () => {
    expect(server.url).toContain("127.0.0.1");
  });
});
