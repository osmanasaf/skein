import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { newCard, type Card } from "../card/card.js";
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

  it("okuma uç noktalarına POST edilemez", async () => {
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

describe("serveUi — kapıyı açmak", () => {
  const birak = (id: string, karar?: string, baslik?: Record<string, string>) =>
    fetch(`${server.url}kart/${id}/birak`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(baslik ?? { "x-skein-token": server.token }) },
      body: JSON.stringify(karar === undefined ? {} : { karar }),
    });

  async function kapida(): Promise<string> {
    const card = await queue.add(newCard({ title: "jitter", task: "iş", topology }));
    const taken = (await queue.take("coder")) as Card;
    await queue.escalate(taken, "ağaçta işlenmemiş değişiklik var: README.md");
    return card.id;
  }

  // Yerel sunucuya yazma eklemek, tarayıcıda açık HERHANGİ bir sitenin
  // kullanıcının haberi olmadan kapı açabilmesi demek.
  it("jetonsuz yazma reddedilir", async () => {
    const id = await kapida();

    const res = await birak(id, "retry", {});

    expect(res.status).toBe(403);
    // Kart yerinde kaldı: reddedilen bir komut hiçbir şeyi oynatmamalı.
    expect((await queue.get(id))?.state).toBe("gate");
  });

  it("yanlış jeton reddedilir", async () => {
    const id = await kapida();
    // Jeton hex; başlık değerleri ByteString olmak zorunda.
    expect((await birak(id, "retry", { "x-skein-token": "deadbeef" })).status).toBe(403);
  });

  it("başka kaynaktan gelen istek reddedilir", async () => {
    const id = await kapida();
    const res = await birak(id, "retry", {
      "x-skein-token": server.token,
      origin: "https://kotu-site.example",
    });
    expect(res.status).toBe(403);
  });

  it("jetonla kapıyı açar ve yeni modeli döndürür", async () => {
    const id = await kapida();

    const res = await birak(id, "retry");
    const veri = (await res.json()) as { kart: { state: string; role: string }; model: { cards: unknown[] } };

    expect(res.status).toBe(200);
    expect(veri.kart).toMatchObject({ state: "queued", role: "coder" });
    // Cevap çekirdeğin ürettiği YENİ durumdan okunuyor, ekranın kopyasından değil.
    expect(veri.model.cards).toHaveLength(1);
    expect((await queue.get(id))?.state).toBe("queued");
  });

  // Çekirdeğin reddi kullanıcıya aynen gitmeli: mesaj gerekçeyi ve çıkış
  // yolunu zaten söylüyor.
  it("kaçış kapısından ileri bırakma 409 ve gerekçeyle reddedilir", async () => {
    const id = await kapida();

    const res = await birak(id, "forward");
    const veri = (await res.json()) as { hata: string };

    expect(res.status).toBe(409);
    expect(veri.hata).toContain("kaçış kapısında");
    expect(veri.hata).toContain("README.md");
    expect((await queue.get(id))?.state).toBe("gate");
  });

  it("bilinmeyen karar reddedilir", async () => {
    const id = await kapida();
    const res = await birak(id, "sallama");
    expect(res.status).toBe(409);
    expect((await queue.get(id))?.state).toBe("gate");
  });

  it("kapıda olmayan kart 409", async () => {
    const card = await queue.add(newCard({ title: "x", task: "iş", topology }));
    expect((await birak(card.id, "retry")).status).toBe(409);
  });

  it("jeton sayfaya gömülü gelir", async () => {
    const html = await (await fetch(server.url)).text();
    expect(html).toContain(server.token);
    expect(html).not.toContain("__JETON__");
  });
});

describe("serveUi — yetim kart", () => {
  // Rolü yaşayan akışta olmayan kart hiçbir sütuna düşmüyor; model onu yine
  // döndürmeli ve işaretlemeli, yoksa ekrandan sessizce kaybolur.
  it("yetim kart modelde işaretli gelir", async () => {
    const yabanci: TopologySnapshot = {
      ...topology,
      roles: [{ ...(topology.roles[0] as TopologySnapshot["roles"][number]), id: "analyst" }],
    };
    await queue.add(newCard({ title: "yetim", task: "iş", topology: yabanci }));

    const model = (await (await fetch(`${server.url}durum`)).json()) as {
      cards: { orphan: boolean; role: string }[];
      totals: { orphans: number };
    };

    expect(model.cards[0]).toMatchObject({ role: "analyst", orphan: true });
    expect(model.totals.orphans).toBe(1);
  });

  it("yetim kart jetonla kapatılabilir", async () => {
    const yabanci: TopologySnapshot = {
      ...topology,
      roles: [{ ...(topology.roles[0] as TopologySnapshot["roles"][number]), id: "analyst" }],
    };
    const card = await queue.add(newCard({ title: "yetim", task: "iş", topology: yabanci }));

    const res = await fetch(`${server.url}kart/${card.id}/kapat`, {
      method: "POST",
      headers: { "x-skein-token": server.token },
    });
    const veri = (await res.json()) as { kart: { state: string }; reason: string };

    expect(res.status).toBe(200);
    expect(veri.kart.state).toBe("done");
    expect(veri.reason).toContain("analyst");
  });

  it("yetim olmayan kart kapatılamaz", async () => {
    const card = await queue.add(newCard({ title: "normal", task: "iş", topology }));

    const res = await fetch(`${server.url}kart/${card.id}/kapat`, {
      method: "POST",
      headers: { "x-skein-token": server.token },
    });

    expect(res.status).toBe(409);
    expect((await queue.get(card.id))?.state).toBe("queued");
  });

  it("jetonsuz kapatma reddedilir", async () => {
    const card = await queue.add(newCard({ title: "normal", task: "iş", topology }));
    const res = await fetch(`${server.url}kart/${card.id}/kapat`, { method: "POST" });
    expect(res.status).toBe(403);
  });
});

describe("serveUi — yaşayan akış", () => {
  /** Topolojiyi sonradan değiştirebilen sahte bir kaynak. */
  function sahteLive(baslangic: TopologySnapshot) {
    return {
      topology: baslangic,
      flow: { name: "test", hash: "aaa" },
      error: null as string | null,
      yoklandi: 0,
      async refresh() {
        this.yoklandi += 1;
      },
    };
  }

  it("her okumada akışı yokluyor", async () => {
    const live = sahteLive(topology);
    const s = await serveUi({ root, queue, topology, flowName: "test", flowHash: "aaa", live });
    try {
      await fetch(`${s.url}durum`);
      await fetch(`${s.url}durum`);
      expect(live.yoklandi).toBe(2);
    } finally {
      await s.close();
    }
  });

  it("yeniden yüklenen topolojiyi çizime yansıtır", async () => {
    const live = sahteLive({ ...topology, roles: [] });
    const s = await serveUi({ root, queue, topology, flowName: "test", flowHash: "aaa", live });
    try {
      const once = (await (await fetch(`${s.url}durum`)).json()) as { roles: unknown[] };
      expect(once.roles).toHaveLength(0);

      live.topology = topology; // dosya değişti
      const sonra = (await (await fetch(`${s.url}durum`)).json()) as { roles: { id: string }[] };
      expect(sonra.roles.map((r) => r.id)).toEqual(["coder"]);
    } finally {
      await s.close();
    }
  });

  // Kullanıcı YAML'ı bozduğunda hiçbir şey olmuyordu; düzenlemenin neden
  // tutmadığı görünmüyordu.
  it("akış geçersizse gerekçeyi modele koyar", async () => {
    const live = sahteLive(topology);
    live.error = "[kural 4] tam olarak bir rolün `next` değeri `done` olmalı";
    const s = await serveUi({ root, queue, topology, flowName: "test", flowHash: "aaa", live });
    try {
      const model = (await (await fetch(`${s.url}durum`)).json()) as { flow: { error?: string } };
      expect(model.flow.error).toContain("kural 4");
    } finally {
      await s.close();
    }
  });
});
