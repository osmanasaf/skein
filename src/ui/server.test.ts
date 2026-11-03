import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { al } from "../testing/queue.js";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { readFile } from "node:fs/promises";
import { acquireLock } from "../watch/lock.js";
import { newCard, type Card } from "../card/card.js";
import { CardQueue } from "../card/queue.js";
import { loadFlow, type Flow } from "../flow/load.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { request } from "node:http";
import { connect } from "node:net";
import { bizeAit, izinliAdlar, jokerArayuz, serveUi, type UiServer } from "./server.js";

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
let gercekFlow: Flow;

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
  gercekFlow = flow;
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
  // Eskiden tek bozuk dosya `/durum`u 500'e düşürüyordu, yani bir kartın
  // bozulması BÜTÜN ekranı kullanılamaz yapıyordu — gözcüyü öldüren
  // kusurun ekran tarafındaki eşi. Artık tarama durmuyor ama bozukluk
  // SAKLANMIYOR: model onu taşıyor ve sayfa uyarı olarak basıyor.
  it("bozuk kart dosyası ekranı düşürmüyor ama görünür kalıyor", async () => {
    await mkdir(join(root, ".skein", "queue", "coder"), { recursive: true });
    const yol = join(root, ".skein", "queue", "coder", "0-bozuk.json");
    await writeFile(yol, "{ yarım");

    const res = await fetch(`${server.url}durum`);

    expect(res.status).toBe(200);
    const m = (await res.json()) as { bozuk: string[] };
    expect(m.bozuk).toHaveLength(1);
    expect(m.bozuk[0]).toContain("0-bozuk.json");
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
    const taken = await al(queue, "coder");
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
      flow: gercekFlow,
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

describe("serveUi — akış düzenleme", () => {
  let s: UiServer;
  const opts = () => ({ root, providers: knownProviderSet() });

  beforeEach(async () => {
    s = await serveUi({
      root, queue, topology, flowName: "test", flowHash: gercekFlow.hash,
      live: { topology, flow: gercekFlow, error: null, refresh: async () => {} },
      flowPath: gercekFlow.path,
      loadOptions: opts(),
      providerIds: ["claude", "codex"],
    });
  });
  afterEach(async () => {
    await s.close();
  });

  const gonder = (yol: string, govde: unknown, jeton?: string) =>
    fetch(`${s.url}${yol}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": jeton ?? s.token },
      body: JSON.stringify(govde),
    });

  it("düzenleyicinin başlangıç hâlini verir", async () => {
    const v = (await (await fetch(`${s.url}akis`)).json()) as {
      draft: { name: string; roles: { id: string }[] };
      providers: string[];
    };
    expect(v.draft.roles.map((r) => r.id)).toEqual(["coder"]);
    expect(v.providers).toEqual(["claude", "codex"]);
  });

  it("geçerli taslakta maliyet ve yaml döner", async () => {
    const draft = ((await (await fetch(`${s.url}akis`)).json()) as { draft: unknown }).draft;

    const v = (await (await gonder("akis/onizleme", draft)).json()) as {
      ok: boolean; yaml: string; cost: { base: number };
    };

    expect(v.ok).toBe(true);
    expect(v.cost.base).toBe(1);
    expect(v.yaml).toContain("id: coder");
  });

  // Kural numaraları kullanıcıya AYNEN gitmeli.
  it("geçersiz taslakta kural numarası döner", async () => {
    const v = (await (await gonder("akis/onizleme", {
      name: "test", constitution: ["../prompts/base.md"],
      roles: [{ id: "coder", provider: "claude", workspace: "main", prompt: "../../roles/coder.prompt", next: "coder" }],
    })).json()) as { ok: boolean; message: string };

    expect(v.ok).toBe(false);
    expect(v.message).toContain("kural");
  });

  // Ekranda denenen her taslak diske düşseydi gözcü yarım taslakları okurdu.
  it("önizleme dosyaya dokunmaz", async () => {
    const once = await readFile(gercekFlow.path, "utf8");
    await gonder("akis/onizleme", { name: "x", constitution: [], roles: [] });
    expect(await readFile(gercekFlow.path, "utf8")).toBe(once);
  });

  it("geçerli taslağı dosyaya yazar", async () => {
    const veri = (await (await fetch(`${s.url}akis`)).json()) as {
      draft: { description?: string };
    };
    veri.draft.description = "ekrandan yazıldı";

    const res = await gonder("akis/yaz", veri.draft);

    expect(res.status).toBe(200);
    expect(await readFile(gercekFlow.path, "utf8")).toContain("ekrandan yazıldı");
  });

  // Ekranın ürettiği dosyayı gözcü de okuyor; bozuk YAML yazmak çalışan bir
  // sistemi ekrandan bozmak olurdu.
  it("geçersiz taslağı YAZMAZ", async () => {
    const once = await readFile(gercekFlow.path, "utf8");

    const res = await gonder("akis/yaz", { name: "test", constitution: [], roles: [] });

    expect(res.status).toBe(409);
    expect(await readFile(gercekFlow.path, "utf8")).toBe(once);
  });

  it("jetonsuz yazma reddedilir", async () => {
    const res = await fetch(`${s.url}akis/yaz`, { method: "POST", body: "{}" });
    expect(res.status).toBe(403);
  });

  it("jetonsuz önizleme de reddedilir", async () => {
    const res = await fetch(`${s.url}akis/onizleme`, { method: "POST", body: "{}" });
    expect(res.status).toBe(403);
  });
});

describe("serveUi — salt okunur ekran", () => {
  it("düzenleme kapalıysa uçlar 404", async () => {
    const res = await fetch(`${server.url}akis/yaz`, {
      method: "POST",
      headers: { "x-skein-token": server.token },
      body: "{}",
    });
    expect(res.status).toBe(404);
    expect(((await (await fetch(`${server.url}akis`)).json()) as { draft: null }).draft).toBeNull();
  });
});

/**
 * ADRES KAPILARI. İki kusur birden düzeltildi ve ikisi de canlı kullanımda
 * ısırıyordu.
 */
describe("adres kapıları", () => {
  // KUSUR 1: kendi adresini DİNLENEN ARAYÜZDEN kuruyordu. Kullanıcı
  // `http://localhost:<port>` açınca — belgelenmiş, olağan kullanım —
  // tarayıcı `Origin: http://localhost:<port>` yolluyor, `127.0.0.1` ile
  // eşleşmiyor, her yazma ucu 403'e düşüyor ve araç sessizce yalnızca-okur
  // oluyordu. Sebep de kullanıcı için anlamsızdı.
  it("localhost kaynağı kabul edilir", async () => {
    const card = await queue.add(newCard({ title: "x", task: "iş", topology }));
    const taken = await al(queue, "coder");
    await queue.escalate(taken, "sebep");
    const res = await fetch(`${server.url}kart/${card.id}/birak`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-skein-token": server.token,
        Origin: `http://localhost:${server.port}`,
      },
      body: JSON.stringify({ karar: "retry" }),
    });
    expect(res.status).toBe(200);
  });

  it("IPv6 döngü kaynağı da kabul edilir", () => {
    const adlar = izinliAdlar("127.0.0.1");
    expect(bizeAit(`http://[::1]:7777`, adlar, 7777)).toBe(true);
    expect(bizeAit(`http://localhost:7777`, adlar, 7777)).toBe(true);
  });

  it("yabancı kaynak hâlâ reddedilir", async () => {
    const card = await queue.add(newCard({ title: "x", task: "iş", topology }));
    const taken = await al(queue, "coder");
    await queue.escalate(taken, "sebep");
    const res = await fetch(`${server.url}kart/${card.id}/birak`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-skein-token": server.token,
        Origin: "http://kotu.example:" + server.port,
      },
      body: JSON.stringify({ karar: "retry" }),
    });
    expect(res.status).toBe(403);
  });

  // Port eşleşmesi zorunlu: aynı makinedeki BAŞKA bir yerel servis bizim
  // kaynağımız değil.
  it("döngü adı ama yanlış port bizim değil", () => {
    const adlar = izinliAdlar("127.0.0.1");
    expect(bizeAit("http://127.0.0.1:9999", adlar, 7777)).toBe(false);
    // Portsuz `Host: 127.0.0.1` (port 80) de bizim değil.
    expect(bizeAit("127.0.0.1", adlar, 7777)).toBe(false);
  });

  /**
   * `Host` başlığını EZEN ham istek.
   *
   * `fetch()` bunu yapamıyor: `Host` yasaklı başlık, sessizce yok sayılıyor.
   * İlk yazımda bu sınamalar `fetch` kullanıyordu ve HİÇBİR ŞEY
   * sınamıyorlardı — tarayıcı başlığı 127.0.0.1 kalıyordu, yani "yabancı
   * Host reddedilir" iddiası kendi kurduğu durumu hiç kurmuyordu.
   */
  const hamIstek = (yol: string, host: string): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port: server.port, path: yol, method: "GET", headers: { Host: host } },
        (res) => {
          let body = "";
          res.setEncoding("utf8");
          res.on("data", (c) => { body += c as string; });
          res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
        },
      );
      req.on("error", reject);
      req.end();
    });

  // KUSUR 2: DNS rebinding. Sunucu 127.0.0.1'e bağlı ama bu TARAYICI
  // ÜZERİNDEN erişimi engellemiyor; saldırganın alan adı 127.0.0.1'e
  // yeniden bağlanırsa onun sayfası bizimle aynı kaynak sayılır. Jeton
  // yalnızca YAZMAYI koruyordu — ve `GET /` jetonu veriyordu.
  it("yabancı Host ile okuma uçları kapalı", async () => {
    for (const yol of ["/", "/durum"]) {
      const res = await hamIstek(yol, `kotu.example:${server.port}`);
      expect(res.status).toBe(403);
    }
  });

  // Asıl bedel bu: `GET /` sayfaya YAZMA JETONUNU gömüyor, yani rebinding
  // ile okunan bir sayfa yazma hakkını da taşır.
  it("yabancı Host sayfaya gömülü jetonu vermiyor", async () => {
    const res = await hamIstek("/", `kotu.example:${server.port}`);
    expect(res.status).toBe(403);
    expect(res.body).not.toContain(server.token);
  });

  it("döngü adıyla gelen Host geçer", async () => {
    const res = await hamIstek("/", `localhost:${server.port}`);
    expect(res.status).toBe(200);
    expect(res.body).toContain(server.token);
  });

  // HTTP/1.1 `Host`u zorunlu kılıyor; "başlık yoksa geç" demek kapıyı
  // başlığı atlayan her istemciye açmaktı.
  //
  // `http.request` ile sınanamıyor: boş `Host` verince node onu kendisi
  // dolduruyor. Başlıksız istek ancak ham soketle kurulabiliyor.
  it("Host başlığı olmayan istek reddedilir", async () => {
    const cevap = await new Promise<string>((resolve, reject) => {
      const s = connect(server.port, "127.0.0.1", () => {
        s.write("GET /durum HTTP/1.1\r\n\r\n");
      });
      let out = "";
      s.setEncoding("utf8");
      s.on("data", (c) => { out += String(c); });
      s.on("end", () => resolve(out));
      s.on("error", reject);
      setTimeout(() => { s.destroy(); resolve(out); }, 3000);
    });
    // 403 bizim kapımız, 400 node'un kendi `Host` zorunluluğu — ikisi de
    // RET. Geçmemesi gereken şey 200.
    expect(cevap).toMatch(/^HTTP\/1\.1 (400|403)/);
  });

  // Joker arayüzde hangi adla erişileceği bilinemez; basılan adres de
  // `http://0.0.0.0:port` olmamalı — o geçerli bir tarayıcı adresi değil.
  it("joker arayüz döngü adına çevrilir", async () => {
    const s = await serveUi({
      root, queue, topology, flowName: gercekFlow.name, flowHash: gercekFlow.hash,
      host: "0.0.0.0",
    });
    try {
      expect(jokerArayuz("0.0.0.0")).toBe(true);
      expect(s.url).toContain("127.0.0.1");
      expect(s.url).not.toContain("0.0.0.0");
      expect(izinliAdlar("0.0.0.0").has("0.0.0.0")).toBe(false);
    } finally {
      await s.close();
    }
  });
});

/**
 * EKRANDAN KART AÇMAK.
 *
 * "Her şeyi önyüzden yönet" hedefinde eksik olan en büyük parça buydu:
 * işe BAŞLAMAK ekranda yoktu, tek yol `card -- new` komutuydu. Pano
 * okunuyor, kapı kararı veriliyor, akış düzenleniyordu — ama iş
 * terminalden giriyordu.
 */
describe("serveUi — ekrandan kart açmak", () => {
  const ac = (govde: unknown, baslik?: Record<string, string>) =>
    fetch(`${server.url}kart/yeni`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(baslik ?? { "x-skein-token": server.token }) },
      body: JSON.stringify(govde),
    });

  it("kart açılıyor ve zincirin ilk rolünün kuyruğuna düşüyor", async () => {
    const res = await ac({ baslik: "jitter", gorev: "retry'a jitter ekle" });

    expect(res.status).toBe(200);
    const veri = await res.json() as { kart: { id: string; role: string; state: string } };
    expect(veri.kart.role).toBe("coder");
    expect(veri.kart.state).toBe("queued");
    // Çekirdek gerçekten yazdı mı — cevabın kendi iddiasına değil kuyruğa bak.
    const kart = await queue.get(veri.kart.id);
    expect(kart?.title).toBe("jitter");
    expect(kart?.task).toBe("retry'a jitter ekle");
    expect(kart?.role).toBe("coder");
  });

  it("cevaptaki model yeni kartı içeriyor", async () => {
    const res = await ac({ baslik: "jitter", gorev: "iş" });
    const veri = await res.json() as { kart: { id: string }; model: { cards: { id: string }[] } };
    // Ekran kendi kopyasını uydurmuyor: çizdiği model çekirdekten geliyor.
    expect(veri.model.cards.map((c) => c.id)).toContain(veri.kart.id);
  });

  // Boş kart, ajana verilecek metni olmayan bir karttır: tur koşar ve
  // hiçbir şey üretmez. `card -- new` de bunu reddediyor.
  it("başlık ya da iş metni boşsa reddediyor", async () => {
    expect((await ac({ baslik: "", gorev: "iş" })).status).toBe(400);
    expect((await ac({ baslik: "başlık", gorev: "   " })).status).toBe(400);
    expect((await ac({})).status).toBe(400);
    // Hiçbiri kuyruğa düşmemeli.
    expect(await queue.list()).toEqual([]);
  });

  it("jetonsuz istek reddedilir ve kart AÇILMAZ", async () => {
    const res = await ac({ baslik: "b", gorev: "g" }, {});
    expect(res.status).toBe(403);
    // Reddedilen bir komut hiçbir şey yazmamalı.
    expect(await queue.list()).toEqual([]);
  });

  it("başka kaynaktan gelen istek reddedilir", async () => {
    const res = await ac({ baslik: "b", gorev: "g" }, {
      "x-skein-token": server.token,
      origin: "https://kotu-site.example",
    });
    expect(res.status).toBe(403);
    expect(await queue.list()).toEqual([]);
  });
});

/**
 * EKRANDAN GÖZCÜ YÖNETİMİ.
 *
 * Kart ekrandan açılabiliyordu ama hiçbir şey koşmuyordu: gözcü ayrı bir
 * kabukta elle başlatılıyordu. Düğme PARAMETRE SEÇMİYOR — model ve araç
 * listesi ekranı açan komutta kuruldu; bu sınamaların asıl işi o sınırı
 * pinlemek.
 */
describe("serveUi — ekrandan gözcü", () => {
  const ARGV = ["node", "tsx", "watch/cli.ts", "test", "--serve", "--model", "claude:m"];

  /** Başlatılan sahte süreçleri kaydeder. */
  function sahte() {
    const cagrilar: string[][] = [];
    const oldurulen: (string | undefined)[] = [];
    const bitirenler: (() => void)[] = [];
    return {
      cagrilar,
      oldurulen,
      /** Sürecin gerçekten bittiğini bildirir. */
      bitir: () => bitirenler.forEach((cb) => cb()),
      spawn: (argv: string[]) => {
        cagrilar.push(argv);
        return {
          pid: 4242,
          kill: (sig?: string) => oldurulen.push(sig),
          // Sahte süreç KENDİLİĞİNDEN bitmiyor: gerçeğinde de durdurma
          // anlık değil, gözcü süren turu bitirince çıkıyor.
          onExit: (cb: () => void) => bitirenler.push(cb),
        };
      },
    };
  }

  async function gozculu(): Promise<{ srv: UiServer; s: ReturnType<typeof sahte> }> {
    const s = sahte();
    const srv = await serveUi({
      root, queue, topology, flowName: "test", flowHash: gercekFlow.hash,
      gozcu: { argv: ARGV, spawn: s.spawn as never },
    });
    return { srv, s };
  }

  it("başlat, EKRANI AÇAN KOMUTUN bayraklarıyla koşuyor", async () => {
    const { srv, s } = await gozculu();
    try {
      const res = await fetch(`${srv.url}gozcu/baslat`, {
        method: "POST",
        headers: { "x-skein-token": srv.token },
      });
      expect(res.status).toBe(200);
      // Tam olarak verilen argv — ekran ona bir şey EKLEMİYOR, çıkarmıyor.
      // Düğmenin model seçebilmesi, ekranın yetkisini sessizce büyütmek olurdu.
      expect(s.cagrilar).toEqual([ARGV]);
    } finally {
      await srv.close();
    }
  });

  it("jetonsuz başlatma reddedilir ve SÜREÇ BAŞLAMAZ", async () => {
    const { srv, s } = await gozculu();
    try {
      const res = await fetch(`${srv.url}gozcu/baslat`, { method: "POST" });
      expect(res.status).toBe(403);
      expect(s.cagrilar).toEqual([]);
    } finally {
      await srv.close();
    }
  });

  it("başka kaynaktan gelen istek reddedilir", async () => {
    const { srv, s } = await gozculu();
    try {
      const res = await fetch(`${srv.url}gozcu/baslat`, {
        method: "POST",
        headers: { "x-skein-token": srv.token, origin: "https://kotu-site.example" },
      });
      expect(res.status).toBe(403);
      expect(s.cagrilar).toEqual([]);
    } finally {
      await srv.close();
    }
  });

  // Tek yazıcı kuralı ekrandan da atlanamıyor: ikinci gözcü, birincinin
  // elindeki kartı çökmüş sanıp kuyruğa geri atar ve aynı iş ikinci kez,
  // para harcayarak yapılır.
  it("zaten açık bir gözcü varsa reddediyor", async () => {
    const { srv, s } = await gozculu();
    try {
      const ilk = await fetch(`${srv.url}gozcu/baslat`, {
        method: "POST", headers: { "x-skein-token": srv.token },
      });
      expect(ilk.status).toBe(200);
      // İlk çağrı sahte süreci başlattı ama kilit YAZILMADI (sahte süreç
      // gerçek gözcü değil), o yüzden kilidi elle kuruyoruz: ölçülen şey
      // "kilit varsa reddet" kuralının kendisi.
      await acquireLock(join(root, ".skein", "daemon.json"), {
        pid: process.pid, startedAt: new Date().toISOString(),
        flow: "test", hash: "abc", mode: "serve",
      });
      const ikinci = await fetch(`${srv.url}gozcu/baslat`, {
        method: "POST", headers: { "x-skein-token": srv.token },
      });
      expect(ikinci.status).toBe(409);
      expect((await ikinci.json() as { hata: string }).hata).toMatch(/Zaten bir gözcü açık/);
      // İkinci süreç BAŞLAMADI.
      expect(s.cagrilar).toHaveLength(1);
    } finally {
      await srv.close();
    }
  });

  it("durdur, başlattığı sürece sinyal gönderiyor", async () => {
    const { srv, s } = await gozculu();
    try {
      await fetch(`${srv.url}gozcu/baslat`, { method: "POST", headers: { "x-skein-token": srv.token } });
      const res = await fetch(`${srv.url}gozcu/durdur`, {
        method: "POST", headers: { "x-skein-token": srv.token },
      });
      expect(res.status).toBe(200);
      expect(s.oldurulen).toEqual(["SIGTERM"]);
      // Durdurma ANLIK DEĞİL ve cevap bunu SÖYLEMEK zorunda: gözcü süren
      // turu bitirip çıkıyor. Söylemezsek kullanıcı hapta hâlâ "açık"
      // görüp düğmenin çalışmadığını sanar — gerçek tarayıcıda tam olarak
      // bu oldu.
      const veri = await res.json() as { mesaj?: string };
      expect(veri.mesaj).toMatch(/KOŞAN TURU bitirip/);
    } finally {
      await srv.close();
    }
  });

  /**
   * İKİNCİ BASIŞ çalışmak zorunda.
   *
   * Eskiden `durdur` referansı hemen bırakıyordu (`cocuk = null`) ve
   * ikinci basış "bu gözcüyü bu ekran başlatmadı" diyordu — ekran kendi
   * başlattığı süreci unutuyordu. Çekirdek ikinci sinyali "hemen çık"
   * sayıyor, yani ikinci basışın ULAŞMASI gerekiyor.
   */
  it("ikinci durdurma da sürece ulaşıyor", async () => {
    const { srv, s } = await gozculu();
    try {
      await fetch(`${srv.url}gozcu/baslat`, { method: "POST", headers: { "x-skein-token": srv.token } });
      await fetch(`${srv.url}gozcu/durdur`, { method: "POST", headers: { "x-skein-token": srv.token } });
      const ikinci = await fetch(`${srv.url}gozcu/durdur`, {
        method: "POST", headers: { "x-skein-token": srv.token },
      });
      expect(ikinci.status).toBe(200);
      expect(s.oldurulen).toEqual(["SIGTERM", "SIGTERM"]);
    } finally {
      await srv.close();
    }
  });

  // Süreç GERÇEKTEN bitince referans bırakılıyor; ondan sonraki durdurma
  // "durdurulacak gözcü yok" demeli.
  it("süreç bitince referans bırakılıyor", async () => {
    const { srv, s } = await gozculu();
    try {
      await fetch(`${srv.url}gozcu/baslat`, { method: "POST", headers: { "x-skein-token": srv.token } });
      s.bitir();
      const res = await fetch(`${srv.url}gozcu/durdur`, {
        method: "POST", headers: { "x-skein-token": srv.token },
      });
      expect(res.status).toBe(409);
      expect((await res.json() as { hata: string }).hata).toMatch(/Durdurulacak gözcü yok/);
    } finally {
      await srv.close();
    }
  });

  /**
   * BAŞKASININ gözcüsü durdurulmuyor.
   *
   * Kilitteki pid'e sinyal göndermek kolay olurdu ama "canlı" olmak "bizim
   * gözcümüz olmak" demek değil: bayat bir kilitte pid geri dönüşmüş,
   * ilgisiz bir sürece ait olabilir. O süreci öldürmek ekranın
   * yapabileceği en kötü şey olurdu.
   */
  it("başlatmadığı gözcüyü durdurmuyor, nereden durduracağını söylüyor", async () => {
    const { srv } = await gozculu();
    try {
      await acquireLock(join(root, ".skein", "daemon.json"), {
        pid: process.pid, startedAt: new Date().toISOString(),
        flow: "test", hash: "abc", mode: "serve",
      });
      const res = await fetch(`${srv.url}gozcu/durdur`, {
        method: "POST", headers: { "x-skein-token": srv.token },
      });
      expect(res.status).toBe(409);
      const veri = await res.json() as { hata: string };
      expect(veri.hata).toMatch(/bu ekran başlatmadı/);
      expect(veri.hata).toMatch(/Ctrl-C/);
    } finally {
      await srv.close();
    }
  });

  // Bayrak verilmeden açılan ekran bugünkü hâlinde kalıyor: akış
  // düzenlemeyle aynı kural — ekranın yetkisi onu açan komutun verdiği kadar.
  it("gözcü bayrağı verilmeden açılan ekranda uç 404", async () => {
    const srv = await serveUi({
      root, queue, topology, flowName: "test", flowHash: gercekFlow.hash,
    });
    try {
      const res = await fetch(`${srv.url}gozcu/baslat`, {
        method: "POST", headers: { "x-skein-token": srv.token },
      });
      expect(res.status).toBe(404);
    } finally {
      await srv.close();
    }
  });

  // Ekran kapanırken kendi başlattığı gözcüyü de kapatıyor: Ctrl-C'den
  // sonra arkada para harcayan bir süreç kalmamalı.
  it("ekran kapanınca gözcü de kapanıyor", async () => {
    const { srv, s } = await gozculu();
    await fetch(`${srv.url}gozcu/baslat`, { method: "POST", headers: { "x-skein-token": srv.token } });
    await srv.close();
    expect(s.oldurulen).toEqual(["SIGTERM"]);
  });
});

