import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { tempRoot } from "../testing/temp-root.js";
import { al } from "../testing/queue.js";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { readFile } from "node:fs/promises";
import { acquireLock } from "../watch/lock.js";
import { newCard, type Card } from "../card/card.js";
import { CardQueue } from "../card/queue.js";
import { EventLog } from "../events/log.js";
import { loadFlow, type Flow } from "../flow/load.js";
import { LiveFlow } from "../flow/live.js";
import type { FlowDraft } from "../flow/draft.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { request } from "node:http";
import { connect } from "node:net";
import {
  isOurOwn, watcherLogQueue, parseWatcherLogLine, allowedNames, jokerArayuz, makeLineWriter, serveUi,
  type UiServer,
} from "./server.js";

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
let realFlow: Flow;

beforeEach(async () => {
  root = await tempRoot("skein-uisrv-");
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
  realFlow = flow;
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

  /**
   * `GET /adimlar` — Ajanlar sekmesinin GERÇEKTEN yeni ucu (DEVIR.md §6,
   * tasarim/SAPMALAR.md §3). `/kart/<id>`in UzunDetail'inden BİLEREK
   * AYRI: bu uç `git show` çalıştırmıyor, yalnızca olay günlüğünü okuyor —
   * Ajanlar panelinin saniyelik yoklaması pahalı bir diff hesabı taşımamalı.
   */
  describe("GET /adimlar", () => {
    it("`kart` parametresi yoksa 400", async () => {
      expect((await fetch(`${server.url}adimlar`)).status).toBe(400);
    });

    it("olmayan kart 404", async () => {
      expect((await fetch(`${server.url}adimlar?kart=c-yok`)).status).toBe(404);
    });

    it("kartın güncel aktivasyonunun adımlarını ARTAN sırada verir", async () => {
      const card = await queue.add(newCard({ title: "jitter", task: "iş", topology }));
      await al(queue, "coder");
      const log = new EventLog(join(root, ".skein", "olaylar.jsonl"), "kosu-1");
      await log.append({
        type: "agent.started", cell: `${card.id}:coder`, role: "coder",
        provider: "claude", model: "m", promptHash: "h",
      });
      await log.append({
        type: "agent.step", cell: `${card.id}:coder`, role: "coder",
        seq: 1, kind: "tool", name: "Read", detail: "src/retry.ts",
      });
      await log.append({
        type: "agent.step", cell: `${card.id}:coder`, role: "coder",
        seq: 2, kind: "tool", name: "Bash", detail: "npx vitest run",
      });

      const res = await fetch(`${server.url}adimlar?kart=${card.id}`);
      const data = (await res.json()) as { steps: { seq: number; name: string | null }[] };

      expect(res.status).toBe(200);
      expect(res.headers.get("cache-control")).toContain("no-store");
      expect(data.steps.map((a) => a.name)).toEqual(["Read", "Bash"]);
    });

    it("bitmiş aktivasyonda boş liste verir — bitmiş bir turun adımı 'şu an' değildir", async () => {
      const card = await queue.add(newCard({ title: "jitter", task: "iş", topology }));
      await al(queue, "coder");
      const log = new EventLog(join(root, ".skein", "olaylar.jsonl"), "kosu-1");
      await log.append({
        type: "agent.started", cell: `${card.id}:coder`, role: "coder",
        provider: "claude", model: "m", promptHash: "h",
      });
      await log.append({ type: "agent.step", cell: `${card.id}:coder`, role: "coder", seq: 1, kind: "tool", name: "Read" });
      await log.append({ type: "agent.finished", cell: `${card.id}:coder`, exitCode: 0, durationMs: 1 });

      const res = await fetch(`${server.url}adimlar?kart=${card.id}`);
      const data = (await res.json()) as { steps: unknown[] };
      expect(data.steps).toEqual([]);
    });
  });

  // Bozuk bir kart dosyası ekranı çökertmemeli.
  // Eskiden tek bozuk dosya `/durum`u 500'e düşürüyordu, yani bir kartın
  // bozulması BÜTÜN ekranı kullanılamaz yapıyordu — gözcüyü öldüren
  // kusurun ekran tarafındaki eşi. Artık tarama durmuyor ama bozukluk
  // SAKLANMIYOR: model onu taşıyor ve sayfa uyarı olarak basıyor.
  it("bozuk kart dosyası ekranı düşürmüyor ama görünür kalıyor", async () => {
    await mkdir(join(root, ".skein", "queue", "coder"), { recursive: true });
    const filePath = join(root, ".skein", "queue", "coder", "0-bozuk.json");
    await writeFile(filePath, "{ yarım");

    const res = await fetch(`${server.url}durum`);

    expect(res.status).toBe(200);
    const m = (await res.json()) as { corrupt: string[] };
    expect(m.corrupt).toHaveLength(1);
    expect(m.corrupt[0]).toContain("0-bozuk.json");
  });

  it("varsayılan olarak yalnızca yerel arayüzü dinler", () => {
    expect(server.url).toContain("127.0.0.1");
  });
});

/**
 * TEMA ANAHTARI — kart c-20261106-e62847 (koyu tema baştan kur + tema
 * anahtarı). Üç hâl: "sistem" (hiç seçim yoksa varsayılan, `<html>`'de
 * nitelik YOK, OS tercihi `@media`'yla izlenir), "acik" (data-theme=
 * "light"), "koyu" (data-theme="dark"). Seçim `.skein/ekran.json`'a
 * yazılıyor (`port-memory.ts`'teki `sonTemaYaz`, port/akış hafızasıyla
 * AYNI dosya) — bu yüzden "sayfa yenilenince korunuyor" iddiası GERÇEK
 * bir HTTP isteğiyle, GERÇEK dosyadan okunarak sınanıyor, bir JS
 * değişkeniyle değil.
 */
/**
 * `<html ...>` ETİKETİNİN KENDİSİ — "data-theme" dizgisi sayfanın CSS'inde
 * (seçici olarak) de geçiyor, ve `<!doctype html>` kendi `>`'siyle BİTİYOR,
 * yani "ilk >'ye kadar" almak doctype'ı yakalar. Bu yüzden önce `<html`
 * aranıyor, KAPANIŞ `>`'si ONDAN SONRA bulunuyor.
 */
function htmlEtiketi(html: string): string {
  const press = html.indexOf("<html");
  return html.slice(press, html.indexOf(">", press) + 1);
}

describe("serveUi — tema anahtarı", () => {
  it("hiç seçim yapılmadıysa GET / <html> niteliksiz döner (sistem)", async () => {
    const html = await (await fetch(server.url)).text();
    expect(htmlEtiketi(html)).toBe('<html lang="tr">');
  });

  it("POST /tema 'koyu' yazar, SONRAKİ GET / data-theme=\"dark\" döner", async () => {
    const writeIt = await fetch(`${server.url}tema`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": server.token },
      body: JSON.stringify({ tema: "koyu" }),
    });
    expect(writeIt.status).toBe(200);

    const html = await (await fetch(server.url)).text();
    expect(htmlEtiketi(html)).toBe('<html lang="tr" data-theme="dark">');
  });

  it("POST /tema 'acik' yazar, SONRAKİ GET / data-theme=\"light\" döner", async () => {
    await fetch(`${server.url}tema`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": server.token },
      body: JSON.stringify({ tema: "acik" }),
    });
    const html = await (await fetch(server.url)).text();
    expect(htmlEtiketi(html)).toBe('<html lang="tr" data-theme="light">');
  });

  it("seçim .skein/ekran.json'a yazılır — AYRI bir sunucu açılışında da okunur", async () => {
    await fetch(`${server.url}tema`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": server.token },
      body: JSON.stringify({ tema: "koyu" }),
    });
    const screen = JSON.parse(await readFile(join(root, ".skein", "ekran.json"), "utf8")) as { tema?: string };
    expect(screen.tema).toBe("koyu");

    // Aynı kök dizinle YENİ bir ekran: port/akış hafızasının izlediği
    // AYNI "diskten oku" ilkesi — işlem belleğinde TUTULAN bir değer
    // değil.
    const s2 = await serveUi({ root, queue, topology, flowName: realFlow.name, flowHash: realFlow.hash });
    try {
      const html = await (await fetch(s2.url)).text();
      expect(htmlEtiketi(html)).toBe('<html lang="tr" data-theme="dark">');
    } finally {
      await s2.close();
    }
  });

  it("jeton yoksa/yanlışsa 403 — kayıt DEĞİŞMİYOR", async () => {
    const res = await fetch(`${server.url}tema`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": "deadbeef" },
      body: JSON.stringify({ tema: "koyu" }),
    });
    expect(res.status).toBe(403);
    const html = await (await fetch(server.url)).text();
    expect(htmlEtiketi(html)).toBe('<html lang="tr">');
  });

  it("geçersiz tema değeri 400 — 'açık' İ'li yazım 'acik' İLE AYNI SAYILMAZ", async () => {
    const res = await fetch(`${server.url}tema`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": server.token },
      body: JSON.stringify({ tema: "açık" }),
    });
    expect(res.status).toBe(400);
    const html = await (await fetch(server.url)).text();
    expect(htmlEtiketi(html)).toBe('<html lang="tr">');
  });

  it("GET /tema yok — yalnızca POST ile yazılır", async () => {
    expect((await fetch(`${server.url}tema`)).status).toBe(404);
  });
});

describe("serveUi — kapıyı açmak", () => {
  const release = (id: string, decision?: string, heading?: Record<string, string>) =>
    fetch(`${server.url}kart/${id}/birak`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(heading ?? { "x-skein-token": server.token }) },
      body: JSON.stringify(decision === undefined ? {} : { decision }),
    });

  async function atGate(): Promise<string> {
    const card = await queue.add(newCard({ title: "jitter", task: "iş", topology }));
    const taken = await al(queue, "coder");
    await queue.escalate(taken, "ağaçta işlenmemiş değişiklik var: README.md");
    return card.id;
  }

  // Yerel sunucuya yazma eklemek, tarayıcıda açık HERHANGİ bir sitenin
  // kullanıcının haberi olmadan kapı açabilmesi demek.
  it("jetonsuz yazma reddedilir", async () => {
    const id = await atGate();

    const res = await release(id, "retry", {});

    expect(res.status).toBe(403);
    // Kart yerinde kaldı: reddedilen bir komut hiçbir şeyi oynatmamalı.
    expect((await queue.get(id))?.state).toBe("gate");
  });

  it("yanlış jeton reddedilir", async () => {
    const id = await atGate();
    // Jeton hex; başlık değerleri ByteString olmak zorunda.
    expect((await release(id, "retry", { "x-skein-token": "deadbeef" })).status).toBe(403);
  });

  it("başka kaynaktan gelen istek reddedilir", async () => {
    const id = await atGate();
    const res = await release(id, "retry", {
      "x-skein-token": server.token,
      origin: "https://kotu-site.example",
    });
    expect(res.status).toBe(403);
  });

  it("jetonla kapıyı açar ve yeni modeli döndürür", async () => {
    const id = await atGate();

    const res = await release(id, "retry");
    const data = (await res.json()) as { card: { state: string; role: string }; model: { cards: unknown[] } };

    expect(res.status).toBe(200);
    expect(data.card).toMatchObject({ state: "queued", role: "coder" });
    // Cevap çekirdeğin ürettiği YENİ durumdan okunuyor, ekranın kopyasından değil.
    expect(data.model.cards).toHaveLength(1);
    expect((await queue.get(id))?.state).toBe("queued");
  });

  // Çekirdeğin reddi kullanıcıya aynen gitmeli: mesaj gerekçeyi ve çıkış
  // yolunu zaten söylüyor.
  it("kaçış kapısından ileri bırakma 409 ve gerekçeyle reddedilir", async () => {
    const id = await atGate();

    const res = await release(id, "forward");
    const data = (await res.json()) as { error: string };

    expect(res.status).toBe(409);
    expect(data.error).toContain("kaçış kapısında");
    expect(data.error).toContain("README.md");
    expect((await queue.get(id))?.state).toBe("gate");
  });

  it("bilinmeyen karar reddedilir", async () => {
    const id = await atGate();
    const res = await release(id, "sallama");
    expect(res.status).toBe(409);
    expect((await queue.get(id))?.state).toBe("gate");
  });

  it("kapıda olmayan kart 409", async () => {
    const card = await queue.add(newCard({ title: "x", task: "iş", topology }));
    expect((await release(card.id, "retry")).status).toBe(409);
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
    const foreign: TopologySnapshot = {
      ...topology,
      roles: [{ ...(topology.roles[0] as TopologySnapshot["roles"][number]), id: "analyst" }],
    };
    await queue.add(newCard({ title: "yetim", task: "iş", topology: foreign }));

    const model = (await (await fetch(`${server.url}durum`)).json()) as {
      cards: { orphan: boolean; role: string }[];
      totals: { orphans: number };
    };

    expect(model.cards[0]).toMatchObject({ role: "analyst", orphan: true });
    expect(model.totals.orphans).toBe(1);
  });

  it("yetim kart jetonla kapatılabilir", async () => {
    const foreign: TopologySnapshot = {
      ...topology,
      roles: [{ ...(topology.roles[0] as TopologySnapshot["roles"][number]), id: "analyst" }],
    };
    const card = await queue.add(newCard({ title: "yetim", task: "iş", topology: foreign }));

    const res = await fetch(`${server.url}kart/${card.id}/kapat`, {
      method: "POST",
      headers: { "x-skein-token": server.token },
    });
    const data = (await res.json()) as { card: { state: string }; reason: string };

    expect(res.status).toBe(200);
    expect(data.card.state).toBe("done");
    expect(data.reason).toContain("analyst");
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
  function fakeLive(startState: TopologySnapshot) {
    return {
      topology: startState,
      flow: realFlow,
      error: null as string | null,
      yoklandi: 0,
      async refresh() {
        this.yoklandi += 1;
      },
    };
  }

  it("her okumada akışı yokluyor", async () => {
    const live = fakeLive(topology);
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
    const live = fakeLive({ ...topology, roles: [] });
    const s = await serveUi({ root, queue, topology, flowName: "test", flowHash: "aaa", live });
    try {
      const once = (await (await fetch(`${s.url}durum`)).json()) as { roles: unknown[] };
      expect(once.roles).toHaveLength(0);

      live.topology = topology; // dosya değişti
      const afterRole = (await (await fetch(`${s.url}durum`)).json()) as { roles: { id: string }[] };
      expect(afterRole.roles.map((r) => r.id)).toEqual(["coder"]);
    } finally {
      await s.close();
    }
  });

  // Kullanıcı YAML'ı bozduğunda hiçbir şey olmuyordu; düzenlemenin neden
  // tutmadığı görünmüyordu.
  it("akış geçersizse gerekçeyi modele koyar", async () => {
    const live = fakeLive(topology);
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
      root, queue, topology, flowName: "test", flowHash: realFlow.hash,
      live: { topology, flow: realFlow, error: null, refresh: async () => {} },
      flowPath: realFlow.path,
      loadOptions: opts(),
      providerIds: ["claude", "codex"],
    });
  });
  afterEach(async () => {
    await s.close();
  });

  const send = (filePath: string, bodyText: unknown, token?: string) =>
    fetch(`${s.url}${filePath}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": token ?? s.token },
      body: JSON.stringify(bodyText),
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

    const v = (await (await send("akis/onizleme", draft)).json()) as {
      ok: boolean; yaml: string; cost: { base: number };
    };

    expect(v.ok).toBe(true);
    expect(v.cost.base).toBe(1);
    expect(v.yaml).toContain("id: coder");
  });

  // Kural numaraları kullanıcıya AYNEN gitmeli.
  it("geçersiz taslakta kural numarası döner", async () => {
    const v = (await (await send("akis/onizleme", {
      name: "test", constitution: ["../prompts/base.md"],
      roles: [{ id: "coder", provider: "claude", workspace: "main", prompt: "../../roles/coder.prompt", next: "coder" }],
    })).json()) as { ok: boolean; message: string };

    expect(v.ok).toBe(false);
    expect(v.message).toContain("kural");
  });

  // Ekranda denenen her taslak diske düşseydi gözcü yarım taslakları okurdu.
  it("önizleme dosyaya dokunmaz", async () => {
    const once = await readFile(realFlow.path, "utf8");
    await send("akis/onizleme", { name: "x", constitution: [], roles: [] });
    expect(await readFile(realFlow.path, "utf8")).toBe(once);
  });

  it("geçerli taslağı dosyaya yazar", async () => {
    const data = (await (await fetch(`${s.url}akis`)).json()) as {
      draft: { description?: string };
    };
    data.draft.description = "ekrandan yazıldı";

    const res = await send("akis/yaz", data.draft);

    expect(res.status).toBe(200);
    expect(await readFile(realFlow.path, "utf8")).toContain("ekrandan yazıldı");
  });

  // Ekranın ürettiği dosyayı gözcü de okuyor; bozuk YAML yazmak çalışan bir
  // sistemi ekrandan bozmak olurdu.
  it("geçersiz taslağı YAZMAZ", async () => {
    const once = await readFile(realFlow.path, "utf8");

    const res = await send("akis/yaz", { name: "test", constitution: [], roles: [] });

    expect(res.status).toBe(409);
    expect(await readFile(realFlow.path, "utf8")).toBe(once);
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

/**
 * DİYAGRAMDAN ROL ÇIKARMA — zincir KOPMAMALI.
 *
 * Diyagramın "rol çıkar" eylemi (bkz. page.ts `rolSil`/`rolSilById`)
 * sunucuya YENİ bir uç GETİRMİYOR: aradan çıkarılmış ve yeniden bağlanmış
 * bir `FlowDraft`, var olan /akis/onizleme + /akis/yaz çiftinden geçiyor
 * (bkz. bu kartın A kısıtı: "YAZMA TEK YOLDAN"). Bu describe o TEK yolun,
 * diyagramın ÜRETMESİ gereken taslağı GERÇEKTEN kabul ettiğini, ve
 * diyagramın ÜRETMEMESİ gereken (temizlenmemiş referans taşıyan) taslağı
 * GERÇEKTEN reddettiğini — ikisini de HTTP üzerinden, tarayıcı
 * gerekmeden — kanıtlıyor.
 *
 * Zincir: coder -> reviewer -> gatekeeper -> done, reviewer coder'a
 * `reject` ve `syncBack` ediyor, gatekeeper reviewer'a `reject` ediyor.
 * "reviewer" çıkarılınca BEKLENEN: coder.next gatekeeper'a kayar,
 * gatekeeper.reject temizlenir (artık var olmayan bir role işaret
 * edemez) — tam olarak page.ts'teki `rolSil`in ürettiği şey.
 */
describe("serveUi — akış düzenleme, diyagramdan rol çıkarma", () => {
  const COKLU_FLOW = `
name: coklu
constitution:
  - ../prompts/base.md
roles:
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: reviewer

  - id: reviewer
    provider: claude
    workspace: reviewer
    prompt: ../../roles/coder.prompt
    receive: batch
    syncBack: [coder]
    reject: coder
    next: gatekeeper

  - id: gatekeeper
    provider: claude
    workspace: gatekeeper
    prompt: ../../roles/coder.prompt
    receive: batch
    reject: reviewer
    next: done
`;

  let s2: UiServer;
  let cokluPath: string;

  beforeEach(async () => {
    cokluPath = join(root, "hub", "flows", "coklu.yaml");
    await writeFile(cokluPath, COKLU_FLOW);
    const live = await LiveFlow.open(cokluPath, { root, providers: knownProviderSet() });
    s2 = await serveUi({
      root, queue, topology: live.topology, flowName: live.flow.name, flowHash: live.flow.hash,
      live, flowPath: live.flow.path, loadOptions: { root, providers: knownProviderSet() },
    });
  });
  afterEach(async () => {
    await s2.close();
  });

  const gonder2 = (filePath: string, bodyText: unknown) =>
    fetch(`${s2.url}${filePath}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": s2.token },
      body: JSON.stringify(bodyText),
    });

  /** Draft'ı okur, "reviewer"i sayfanın `rolSil`iyle AYNI şekilde çıkarır. */
  async function reviewerRemovedDraft(): Promise<FlowDraft> {
    const data = (await (await fetch(`${s2.url}akis`)).json()) as { draft: FlowDraft };
    const draftDoc = data.draft;
    const giden = draftDoc.roles.find((r) => r.id === "reviewer");
    if (giden === undefined) throw new Error("reviewer taslakta yok");
    const remaining = draftDoc.roles.filter((r) => r.id !== "reviewer").map((r) => {
      // `exactOptionalPropertyTypes` altında `reject`i `undefined`a
      // ATAMAK yerine ANAHTARI hiç taşımıyoruz — page.ts'teki `rolSil`in
      // JS'te yaptığı "sil" burada tip düzeyinde "alanı hiç yazma" olur.
      const { reject, ...left } = r;
      return {
        ...left,
        next: r.next === giden.id ? giden.next : r.next,
        ...(reject !== undefined && reject !== giden.id ? { reject } : {}),
        ...(r.syncBack ? { syncBack: r.syncBack.filter((x) => x !== giden.id) } : {}),
      };
    });
    return { ...draftDoc, roles: remaining };
  }

  it("doğru BAĞLANMIŞ taslak (next kaydırılmış, reject temizlenmiş) doğrulamadan GEÇER", async () => {
    const draftDoc = await reviewerRemovedDraft();
    // BEKLENEN RECONNECT: coder artık doğrudan gatekeeper'a next veriyor.
    expect(draftDoc.roles.find((r) => r.id === "coder")?.next).toBe("gatekeeper");
    // BEKLENEN TEMİZLİK: var olmayan role işaret eden reject kalmıyor.
    expect(draftDoc.roles.find((r) => r.id === "gatekeeper")?.reject).toBeUndefined();

    const v = (await (await gonder2("akis/onizleme", draftDoc)).json()) as { ok: boolean; message?: string };
    expect(v.ok).toBe(true);
  });

  it("TEMİZLENMEMİŞ referans (gatekeeper hâlâ silinen reviewer'ı reddediyor) kural numarasıyla REDDEDİLİR", async () => {
    const draftDoc = await reviewerRemovedDraft();
    // MUTASYON BURADA ELLE: reconnect/temizlik adımı atlanmış GİBİ davran —
    // "çıkarılan role işaret eden kenarlar temizlenmezse ne olur" sorusunun
    // kanıtı. Diyagramın `rolSil`i bunu asla üretmemeli; bu taslak onun
    // YOKLUĞUNDA ortaya çıkacak hâli taşıyor.
    const notCleaned: FlowDraft = {
      ...draftDoc,
      roles: draftDoc.roles.map((r) => (r.id === "gatekeeper" ? { ...r, reject: "reviewer" } : r)),
    };

    const v = (await (await gonder2("akis/onizleme", notCleaned)).json()) as {
      ok: boolean; message?: string;
    };
    expect(v.ok).toBe(false);
    expect(v.message).toContain("kural");
  });

  it("geçersiz (temizlenmemiş) taslak YAZILMAZ, ESKİ akış (3 rol) aynen durur", async () => {
    const once = await readFile(cokluPath, "utf8");
    const draftDoc = await reviewerRemovedDraft();
    const notCleaned: FlowDraft = {
      ...draftDoc,
      roles: draftDoc.roles.map((r) => (r.id === "gatekeeper" ? { ...r, reject: "reviewer" } : r)),
    };

    const res = await gonder2("akis/yaz", notCleaned);

    expect(res.status).toBe(409);
    expect(await readFile(cokluPath, "utf8")).toBe(once);
  });

  it("doğru taslak yazılınca zincir KOPMADAN 2 role düşer, coder DOĞRUDAN gatekeeper'a next veriyor", async () => {
    const draftDoc = await reviewerRemovedDraft();

    const res = await gonder2("akis/yaz", draftDoc);
    expect(res.status).toBe(200);

    const yaml = await readFile(cokluPath, "utf8");
    expect(yaml).not.toContain("reviewer");
    expect(yaml).toMatch(/id: coder[\s\S]*next: gatekeeper/);

    // GET /akis sonraki okumada da aynı GERÇEĞİ görüyor — ekranın kendi
    // kopyası değil, diskten yeniden okunan taslak.
    const data = (await (await fetch(`${s2.url}akis`)).json()) as { draft: FlowDraft };
    expect(data.draft.roles.map((r) => r.id)).toEqual(["coder", "gatekeeper"]);
    expect(data.draft.roles.find((r) => r.id === "coder")?.next).toBe("gatekeeper");
  });
});

/**
 * ROL PROMPTLARI EKRANDAN DÜZENLEME.
 *
 * "Her şeyi önyüzden" listesinin son maddesi: akış YAML'ı ekrandan
 * düzenlenebiliyordu, ajanın gördüğü METİN (anayasa + rol promptu)
 * düzenlenemiyordu. Asıl sınanan şey YOL BEYAZ LİSTESİ: `yol` istemciden
 * geliyor ve burada ÜYELİKLE doğrulanıyor — dizgi temizlenerek değil,
 * çünkü temizleme kuralı bir gün eksik kalır, üyelik kalmaz.
 */
describe("serveUi — rol promptları", () => {
  let s: UiServer;
  const opts = () => ({ root, providers: knownProviderSet() });

  beforeEach(async () => {
    s = await serveUi({
      root, queue, topology, flowName: "test", flowHash: realFlow.hash,
      live: { topology, flow: realFlow, error: null, refresh: async () => {} },
      flowPath: realFlow.path,
      loadOptions: opts(),
    });
  });
  afterEach(async () => {
    await s.close();
  });

  const sendPrompt = (bodyText: unknown, token?: string) =>
    fetch(`${s.url}prompt/yaz`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": token ?? s.token },
      body: JSON.stringify(bodyText),
    });

  // Liste TOPOLOJİDEN türüyor: akıştaki tek rolün promptu + tek anayasa
  // katmanı, test.yaml'daki SIRAYLA.
  it("GET /promptlar akışın bildirdiği dosyaları listeler", async () => {
    const v = (await (await fetch(`${s.url}promptlar`)).json()) as {
      prompts: { label: string; path: string }[];
    };
    expect(v.prompts).toEqual([
      { label: "anayasa:1", path: "hub/prompts/base.md" },
      { label: "rol:coder", path: "roles/coder.prompt" },
    ]);
  });

  it("GET /prompt dosyanın gerçek metnini döner", async () => {
    const v = (await (await fetch(`${s.url}prompt?yol=roles/coder.prompt`)).json()) as {
      text: string;
    };
    expect(v.text).toBe("# coder\n");
  });

  // ÜYELİK: dosya diskte GERÇEKTEN var (test.yaml) ama listede değil —
  // listede olmayan HİÇBİR yol, var olsa da, okunamaz.
  it("GET /prompt listede olmayan yolu reddeder", async () => {
    const res = await fetch(`${s.url}prompt?yol=${encodeURIComponent("hub/flows/test.yaml")}`);
    const v = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(v.error).toContain("Bilinmeyen prompt yolu");
  });

  it("GET /prompt '../' içeren yolu reddeder", async () => {
    const res = await fetch(`${s.url}prompt?yol=${encodeURIComponent("../../../etc/passwd")}`);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("Bilinmeyen prompt yolu");
  });

  it("GET /prompt mutlak yolu reddeder", async () => {
    const res = await fetch(`${s.url}prompt?yol=${encodeURIComponent("/etc/passwd")}`);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("Bilinmeyen prompt yolu");
  });

  it("POST /prompt/yaz dosyayı gerçekten değiştirir ve yeni modeli döner", async () => {
    const res = await sendPrompt({ path: "roles/coder.prompt", text: "# coder\nyeni satır\n" });
    const v = (await res.json()) as { model: { flow: { name: string } } };

    expect(res.status).toBe(200);
    expect(v.model.flow.name).toBe("test");
    // İDDİA sunucunun söylediği değil, DİSKTE GERÇEKTEN ne olduğu.
    expect(await readFile(join(root, "roles", "coder.prompt"), "utf8")).toBe("# coder\nyeni satır\n");
  });

  // ÜYELİK yazmada da aynı kapı: listede olmayan bir yola GERÇEKTEN var
  // olsa da yazılamaz, ve denemenin kendisi dosyaya DOKUNMAZ.
  it("POST /prompt/yaz listede olmayan yolu reddeder, dosya DEĞİŞMEZ", async () => {
    const once = await readFile(join(root, "hub", "flows", "test.yaml"), "utf8");
    const res = await sendPrompt({ path: "hub/flows/test.yaml", text: "name: ele-gecirildi\n" });
    const v = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(v.error).toContain("Bilinmeyen prompt yolu");
    expect(await readFile(join(root, "hub", "flows", "test.yaml"), "utf8")).toBe(once);
  });

  it("POST /prompt/yaz '../' içeren yolu reddeder, akışın GERÇEK dosyaları DEĞİŞMEZ", async () => {
    const once = await readFile(join(root, "roles", "coder.prompt"), "utf8");
    const res = await sendPrompt({ path: "../../../etc/passwd", text: "ele geçirildi" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("Bilinmeyen prompt yolu");
    expect(await readFile(join(root, "roles", "coder.prompt"), "utf8")).toBe(once);
  });

  it("POST /prompt/yaz mutlak yolu reddeder, akışın GERÇEK dosyaları DEĞİŞMEZ", async () => {
    const once = await readFile(join(root, "roles", "coder.prompt"), "utf8");
    const res = await sendPrompt({ path: "/etc/passwd", text: "ele geçirildi" });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("Bilinmeyen prompt yolu");
    expect(await readFile(join(root, "roles", "coder.prompt"), "utf8")).toBe(once);
  });

  /**
   * BEYAZ LİSTE "ÜYELİK" SORAR, "İLE BİTİYOR MU" SORMAZ.
   *
   * Yukarıdaki sınamalar kapıyı tamamen KALDIRAN mutasyonu düşürüyor ama
   * onu GEVŞETEN mutasyonu düşürmüyordu: eşitlik yerine "istenen yol
   * listedeki bir yolla bitiyor mu" yazılsa hepsi yeşil kalırdı. Oysa
   * yollar köke göreli ve uç yolu kökle birleştiriyor — listedeki bir
   * yolla BİTEN ama başka bir dizine çıkan bir istek o zaman kapıyı geçer,
   * ve bu gerçek bir dizin aşımıdır. Aşağıdaki iki sınama tam o mutasyonu
   * öldürmek için var; istenen yol listedeki rol promptuyla BİTİYOR.
   *
   * Sınamanın ısırması, kusurun kendisinden önce gelir: ısırmayan bir
   * sınama kuralı yazmış gibi yapar, yazmaz.
   */
  const outsideVictim = async () => {
    const dir = await tempRoot("skein-kurban-");
    await mkdir(join(dir, "roles"), { recursive: true });
    const file = join(dir, "roles", "coder.prompt");
    await writeFile(file, "KURBAN\n");
    // Köke göreli ama kökün DIŞINA çıkan yol; listedeki "roles/coder.prompt"
    // ile bitiyor, dolayısıyla gevşek bir kapıyı geçerdi.
    return { dir, file, path: relative(root, file).split(sep).join("/") };
  };

  it("GET /prompt listedeki yolla BİTEN ama kök dışına çıkan yolu reddeder", async () => {
    const k = await outsideVictim();
    try {
      const res = await fetch(`${s.url}prompt?yol=${encodeURIComponent(k.path)}`);
      const v = (await res.json()) as { error?: string; text?: string };

      expect(res.status).toBe(400);
      expect(v.error).toContain("Bilinmeyen prompt yolu");
      // Sızıntı olmadığını AYRICA iddia ediyoruz: 400 dönüp metni de
      // göndermek mümkün olurdu.
      expect(v.text).toBeUndefined();
    } finally {
      await rm(k.dir, { recursive: true, force: true });
    }
  });

  it("POST /prompt/yaz listedeki yolla BİTEN dış yolu reddeder, DIŞ DOSYA DEĞİŞMEZ", async () => {
    const k = await outsideVictim();
    try {
      const res = await sendPrompt({ path: k.path, text: "ele geçirildi\n" });

      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toContain("Bilinmeyen prompt yolu");
      // İDDİA sunucunun söylediği değil, DİSKTE ne olduğu.
      expect(await readFile(k.file, "utf8")).toBe("KURBAN\n");
    } finally {
      await rm(k.dir, { recursive: true, force: true });
    }
  });

  // Sessizce etkisiz kalan bir katman olmayandan kötü (bkz. flow/load.ts
  // kural 9/11) — bu kural burada da geçerli, çünkü `LiveFlow.refresh()`
  // akış dosyası değişmediği sürece prompt dosyalarına hiç bakmıyor.
  it("POST /prompt/yaz boş metni reddeder, dosya DEĞİŞMEZ", async () => {
    const once = await readFile(join(root, "roles", "coder.prompt"), "utf8");
    const res = await sendPrompt({ path: "roles/coder.prompt", text: "   \n" });
    const v = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(v.error).toContain("boş olamaz");
    expect(await readFile(join(root, "roles", "coder.prompt"), "utf8")).toBe(once);
  });

  it("jetonsuz yazma reddedilir, dosya DEĞİŞMEZ", async () => {
    const once = await readFile(join(root, "roles", "coder.prompt"), "utf8");
    const res = await fetch(`${s.url}prompt/yaz`, {
      method: "POST",
      body: JSON.stringify({ path: "roles/coder.prompt", text: "ele geçirildi" }),
    });
    expect(res.status).toBe(403);
    expect(await readFile(join(root, "roles", "coder.prompt"), "utf8")).toBe(once);
  });

  it("başka kaynaktan gelen yazma isteği reddedilir, dosya DEĞİŞMEZ", async () => {
    const once = await readFile(join(root, "roles", "coder.prompt"), "utf8");
    const res = await fetch(`${s.url}prompt/yaz`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-skein-token": s.token,
        origin: "https://kotu-site.example",
      },
      body: JSON.stringify({ path: "roles/coder.prompt", text: "ele geçirildi" }),
    });
    expect(res.status).toBe(403);
    expect(await readFile(join(root, "roles", "coder.prompt"), "utf8")).toBe(once);
  });
});

/**
 * Akış düzenlemeyle AYNI yetki kapısı: `flowPath`/`loadOptions` verilmeyen
 * salt okunur bir ekranda rol promptları da yazılamaz. "Ekranın yetkisi,
 * onu açan komutun verdiği kadar" kuralının aynısı.
 */
describe("serveUi — rol promptları, salt okunur ekran", () => {
  it("düzenleme kapalıysa POST /prompt/yaz 404, dosya DEĞİŞMEZ", async () => {
    const once = await readFile(join(root, "roles", "coder.prompt"), "utf8");
    const res = await fetch(`${server.url}prompt/yaz`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": server.token },
      body: JSON.stringify({ path: "roles/coder.prompt", text: "ele geçirildi" }),
    });
    expect(res.status).toBe(404);
    expect(await readFile(join(root, "roles", "coder.prompt"), "utf8")).toBe(once);
  });

  // OKUMA UÇLARI gatelenmiyor: liste ve metin salt okunur ekranda da
  // görülebilir, yetki yalnızca YAZMAYI kapatıyor.
  it("düzenleme kapalıyken GET /promptlar ve GET /prompt yine çalışır", async () => {
    const items = (await (await fetch(`${server.url}promptlar`)).json()) as {
      prompts: { path: string }[];
    };
    expect(items.prompts.map((p) => p.path)).toContain("roles/coder.prompt");

    const okuma = (await (await fetch(`${server.url}prompt?yol=roles/coder.prompt`)).json()) as {
      text: string;
    };
    expect(okuma.text).toBe("# coder\n");
  });
});

/**
 * YENİ ROL + PROMPTU, ATOMİK.
 *
 * Kilitlenme: akışa yeni rolü eklemek için prompt dosyası var ve dolu
 * olmalı (kural 9), ama prompt dosyasını yazmak için yol akışın bildirdiği
 * listede olmalı (`/prompt/yaz`ın ÜYELİK kapısı) — rolü dosyasız
 * ekleyemiyorsun, dosyayı rolsüz yaratamıyorsun. `POST /rol/yeni` ikisini
 * TEK işlemde yapıyor; asıl sınanan şey ATOMİKLİK (doğrulama başarısızsa
 * İKİSİ DE geri alınır) ve AYNI ID'nin dosya yazılmadan reddedildiği.
 */
describe("serveUi — yeni rol", () => {
  let s: UiServer;
  const opts = () => ({ root, providers: knownProviderSet() });

  beforeEach(async () => {
    // GERÇEK `LiveFlow` — sahte (no-op) `refresh` burada YETMEZ: bu
    // sınamaların asıl iddiası modelin YAZILAN YENİ rolü GERÇEKTEN
    // göstermesi, yoklama gerçekten dosyayı okumalı.
    const live = await LiveFlow.open(realFlow.path, opts());
    s = await serveUi({
      root, queue, topology, flowName: "test", flowHash: realFlow.hash,
      live, flowPath: realFlow.path, loadOptions: opts(),
    });
  });
  afterEach(async () => {
    await s.close();
  });

  const send = (bodyText: unknown, token?: string) =>
    fetch(`${s.url}rol/yeni`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": token ?? s.token },
      body: JSON.stringify(bodyText),
    });

  // test.yaml'ın tek rolü "coder" (workspace: main), prompt'u
  // roles/coder.prompt — yeni rolün promptu AYNI dizinde (roles/) kuruluyor.
  // Fonksiyon: `root` yalnızca `beforeEach` koştuktan SONRA biliniyor, bu
  // yüzden burada (describe gövdesinde, testlerden ÖNCE) sabitlenemez.
  const newRolePath = () => join(root, "roles", "reviewer.md");

  it("rol VE promptu BİRLİKTE yaratılır, zincire 'sonra'nın ARDINA bağlanır", async () => {
    const res = await send({
      id: "reviewer", provider: "claude", workspace: "reviewer", afterRole: "coder",
    });
    const v = (await res.json()) as { model: { roles: { id: string }[] } };

    expect(res.status).toBe(200);
    expect(v.model.roles.map((r) => r.id)).toEqual(["coder", "reviewer"]);

    // Prompt BOŞ değil — ŞABLONDAN yazıldı (gövde prompt vermedi).
    const promptText = await readFile(newRolePath(), "utf8");
    expect(promptText).toContain("Rolün: reviewer");
    expect(promptText.trim()).not.toBe("");

    // YAML da GERÇEKTEN değişti — yeni rol, eski rolün next'i, ikisi de.
    const yaml = await readFile(realFlow.path, "utf8");
    expect(yaml).toContain("id: reviewer");
    expect(yaml).toContain("next: reviewer"); // coder.next artık reviewer
  });

  it("gövdede verilen prompt metni ŞABLON YERİNE yazılır", async () => {
    const res = await send({
      id: "reviewer", provider: "claude", workspace: "reviewer", afterRole: "coder",
      prompt: "# özel prompt\nbaştan yazıldı\n",
    });
    expect(res.status).toBe(200);
    expect(await readFile(newRolePath(), "utf8")).toBe("# özel prompt\nbaştan yazıldı\n");
  });

  /**
   * ATOMİKLİK — asıl sınanan şey bu. `workspace: main` zaten "coder"da
   * var (kural 2: tam olarak bir rol main olabilir), yani bu istek
   * GEÇERSİZ bir topoloji üretir. İKİSİ DE geri alınmalı: dosya diskte
   * YOK, YAML DEĞİŞMEMİŞ.
   */
  it("geçersiz akış üretirse rol VE prompt dosyası İKİSİ DE GERİ ALINIR", async () => {
    const beforeYaml = await readFile(realFlow.path, "utf8");

    const res = await send({
      id: "reviewer", provider: "claude", workspace: "main", afterRole: "coder",
    });
    const v = (await res.json()) as { error: string };

    expect(res.status).toBe(409);
    expect(v.error).toContain("kural 2");

    // YAML DEĞİŞMEMİŞ.
    expect(await readFile(realFlow.path, "utf8")).toBe(beforeYaml);
    // Dosya diskte YOK — GERİ ALINDI, kalıcı bırakılmadı.
    await expect(readFile(newRolePath(), "utf8")).rejects.toThrow();
  });

  it("AYNI ID reddedilir, dosya YAZILMADAN", async () => {
    const res = await send({ id: "coder", provider: "claude", workspace: "x", afterRole: "coder" });
    const v = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(v.error).toContain("Rol zaten var");
    // "coder" id'si için olası prompt yolu bile hiç yazılmamış olmalı.
    await expect(readFile(join(root, "roles", "coder.md"), "utf8")).rejects.toThrow();
  });

  it("bilinmeyen 'sonra' reddedilir, hiçbir şey değişmez", async () => {
    const beforeYaml = await readFile(realFlow.path, "utf8");
    const res = await send({
      id: "reviewer", provider: "claude", workspace: "reviewer", afterRole: "boyle-bir-rol-yok",
    });
    const v = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(v.error).toContain("Bilinmeyen rol");
    expect(await readFile(realFlow.path, "utf8")).toBe(beforeYaml);
    await expect(readFile(newRolePath(), "utf8")).rejects.toThrow();
  });

  it("jetonsuz istek 403, hiçbir şey değişmez", async () => {
    const beforeYaml = await readFile(realFlow.path, "utf8");
    const res = await fetch(`${s.url}rol/yeni`, {
      method: "POST",
      body: JSON.stringify({ id: "reviewer", provider: "claude", workspace: "reviewer", afterRole: "coder" }),
    });
    expect(res.status).toBe(403);
    expect(await readFile(realFlow.path, "utf8")).toBe(beforeYaml);
    await expect(readFile(newRolePath(), "utf8")).rejects.toThrow();
  });

  it("başka kaynaktan gelen istek reddedilir, hiçbir şey değişmez", async () => {
    const beforeYaml = await readFile(realFlow.path, "utf8");
    const res = await fetch(`${s.url}rol/yeni`, {
      method: "POST",
      headers: {
        "content-type": "application/json", "x-skein-token": s.token,
        origin: "https://kotu-site.example",
      },
      body: JSON.stringify({ id: "reviewer", provider: "claude", workspace: "reviewer", afterRole: "coder" }),
    });
    expect(res.status).toBe(403);
    expect(await readFile(realFlow.path, "utf8")).toBe(beforeYaml);
    await expect(readFile(newRolePath(), "utf8")).rejects.toThrow();
  });
});

describe("serveUi — yeni rol, salt okunur ekran", () => {
  it("düzenleme kapalıysa POST /rol/yeni 404, hiçbir şey değişmez", async () => {
    const beforeYaml = await readFile(join(root, "hub", "flows", "test.yaml"), "utf8");
    const res = await fetch(`${server.url}rol/yeni`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": server.token },
      body: JSON.stringify({ id: "reviewer", provider: "claude", workspace: "reviewer", afterRole: "coder" }),
    });
    expect(res.status).toBe(404);
    expect(await readFile(join(root, "hub", "flows", "test.yaml"), "utf8")).toBe(beforeYaml);
    await expect(readFile(join(root, "roles", "reviewer.md"), "utf8")).rejects.toThrow();
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
 * EKRANDAN AKIŞ SEÇİMİ.
 *
 * Ekran bugüne kadar açılışta verilen TEK akışa bağlıydı: başka bir akışa
 * bakmak için ekranı kapatıp komutu yeniden yazmak gerekiyordu. Bu
 * sınamaların asıl işi üç kuralı pinlemek: değişiklik ATOMİK (başarısız
 * `ac()` eskisini bozmaz), AD listeye ÜYELİKLE doğrulanır (dizgi
 * temizleme değil), ve yazma kapısı diğer yazma uçlarıyla aynı.
 */
describe("serveUi — akış seçimi", () => {
  const FLOW2 = `
name: ikinci
constitution:
  - ../prompts/base.md
roles:
  - id: analiz
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: done
`;

  /** İkinci akış dosyasını yazar ve iki akış arasında seçim yapabilen bir ekran açar. */
  async function flowChoosingServer(): Promise<UiServer> {
    await writeFile(join(root, "hub", "flows", "ikinci.yaml"), FLOW2);
    const live = await LiveFlow.open(join(root, "hub", "flows", "test.yaml"), {
      root, providers: knownProviderSet(),
    });
    return serveUi({
      root, queue, topology, flowName: "test", flowHash: realFlow.hash, live,
      flowChoice: {
        list: async () => ["test", "ikinci"],
        open: async (itemName) => {
          const l = await LiveFlow.open(join(root, "hub", "flows", `${itemName}.yaml`), {
            root, providers: knownProviderSet(),
          });
          return { live: l, flowPath: l.flow.path };
        },
      },
    });
  }

  it("GET /akislar listeyi ve aktif akışı döner", async () => {
    const s = await flowChoosingServer();
    try {
      const v = (await (await fetch(`${s.url}akislar`)).json()) as {
        flows: string[]; active: string;
      };
      expect(v.flows).toEqual(["test", "ikinci"]);
      expect(v.active).toBe("test");
    } finally {
      await s.close();
    }
  });

  /**
   * ÖZET — Akışlar sekmesinin kart ızgarası (DEVIR.md §4): her akışın
   * kendi ROL ZİNCİRİ (`draft.roles`, zincir sırasında — `fromFlow` zaten
   * `flow.roles`'tan türüyor, bu testin ikinci bir ayrıştırıcı yazmasına
   * gerek yok) ekranın O AN baktığı akıştan BAĞIMSIZ okunabilmeli — aktif
   * akış "test" olsa bile "ikinci"nin de rolleri burada.
   */
  it("GET /akislar her akış için rol zincirini özetliyor", async () => {
    const s = await flowChoosingServer();
    try {
      const v = (await (await fetch(`${s.url}akislar`)).json()) as {
        summary: { name: string; draft: { roles: { id: string }[] } | null; error?: string }[];
      };
      const test = v.summary.find((o) => o.name === "test");
      const ikinci = v.summary.find((o) => o.name === "ikinci");
      expect(test?.draft?.roles.map((r) => r.id)).toEqual(["coder"]);
      expect(ikinci?.draft?.roles.map((r) => r.id)).toEqual(["analiz"]);
      expect(test?.error).toBeUndefined();
    } finally {
      await s.close();
    }
  });

  // Bir akışın bozulması listenin GERİ KALANINI göstermeyi engellememeli —
  // `m.bozuk`/`m.engeller`in "izole et ama SAKLAMA" ilkesinin aynısı.
  it("GET /akislar bozuk bir akışı 'hata' ile taşır, diğerlerini göstermeyi sürdürür", async () => {
    await writeFile(join(root, "hub", "flows", "ikinci.yaml"), FLOW2);
    await writeFile(join(root, "hub", "flows", "bozuk.yaml"), `
name: bozuk
constitution:
  - ../prompts/base.md
roles:
  - id: coder
    provider: claude
    workspace: main
    prompt: ../../roles/coder.prompt
    next: coder
`);
    const live = await LiveFlow.open(join(root, "hub", "flows", "test.yaml"), {
      root, providers: knownProviderSet(),
    });
    const s = await serveUi({
      root, queue, topology, flowName: "test", flowHash: realFlow.hash, live,
      flowChoice: {
        list: async () => ["test", "ikinci", "bozuk"],
        open: async (itemName) => {
          const l = await LiveFlow.open(join(root, "hub", "flows", `${itemName}.yaml`), {
            root, providers: knownProviderSet(),
          });
          return { live: l, flowPath: l.flow.path };
        },
      },
    });
    try {
      const v = (await (await fetch(`${s.url}akislar`)).json()) as {
        summary: { name: string; draft: unknown; error?: string }[];
      };
      const corruptSummary = v.summary.find((o) => o.name === "bozuk");
      const digerleri = v.summary.filter((o) => o.name !== "bozuk");
      expect(corruptSummary?.draft).toBeNull();
      expect(corruptSummary?.error).toContain("kural");
      expect(digerleri.every((o) => o.draft !== null)).toBe(true);
    } finally {
      await s.close();
    }
  });

  // OKUMA UCU: `akisSecimi` verilmemiş bir ekranda 404 değil boş liste —
  // ekran seçiciyi bu uca bakarak çizebilmeli.
  it("akisSecimi verilmemişse GET /akislar boş liste döner (404 değil)", async () => {
    const res = await fetch(`${server.url}akislar`);
    const v = (await res.json()) as { flows: string[]; active: string };
    expect(res.status).toBe(200);
    expect(v.flows).toEqual([]);
    expect(v.active).toBe("test");
  });

  it("akisSecimi verilmemişse POST /akis/sec 404", async () => {
    const res = await fetch(`${server.url}akis/sec`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": server.token },
      body: JSON.stringify({ name: "test" }),
    });
    expect(res.status).toBe(404);
  });

  it("seçim akışı değiştiriyor ve sonraki okumalar yeni akışı görüyor", async () => {
    const s = await flowChoosingServer();
    try {
      const res = await fetch(`${s.url}akis/sec`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-skein-token": s.token },
        body: JSON.stringify({ name: "ikinci" }),
      });
      const v = (await res.json()) as {
        model: { flow: { name: string }; roles: { id: string }[] };
      };

      expect(res.status).toBe(200);
      expect(v.model.flow.name).toBe("ikinci");
      expect(v.model.roles.map((r) => r.id)).toEqual(["analiz"]);

      // Değişiklik SADECE cevapta değil: sonraki bağımsız bir okuma da
      // yeni akışı görmeli — ekran kendi kopyasını değil çekirdeğin
      // tuttuğu `aktif`i okuyor.
      const durum = (await (await fetch(`${s.url}durum`)).json()) as { flow: { name: string } };
      expect(durum.flow.name).toBe("ikinci");
    } finally {
      await s.close();
    }
  });

  /**
   * ATOMİKLİK: `ac()` listede OLAN bir ad için de fırlatabilir (bozuk
   * YAML, kural ihlali) ve bu durumda eski akış AYNEN durmalı — "yarı
   * yüklenmiş akış" diye bir durum yok.
   */
  it("ac() başarısızsa (bozuk YAML) eski akış aynen durur", async () => {
    const live = await LiveFlow.open(join(root, "hub", "flows", "test.yaml"), {
      root, providers: knownProviderSet(),
    });
    const s = await serveUi({
      root, queue, topology, flowName: "test", flowHash: realFlow.hash, live,
      // Düzenleme de AÇIK: `aktif.flowPath` yalnızca `model`den değil,
      // `/akis/yaz`ın GERÇEKTEN hangi dosyaya yazdığından da sınanabilsin —
      // yarı güncellenmiş bir `flowPath` (yeni ada erken bağlanmış) `live`
      // eski kalsa bile `/durum`da görünmez, ama bir sonraki kaydı YANLIŞ
      // dosyaya yazdırır.
      flowPath: live.flow.path,
      loadOptions: { root, providers: knownProviderSet() },
      flowChoice: {
        // "bozuk" listede VAR, yani üyelik denetimini geçiyor — asıl
        // sınanan şey `ac()`in kendi reddi.
        list: async () => ["test", "bozuk"],
        open: async (itemName) => {
          if (itemName === "bozuk") throw new Error("[kural 4] tam olarak bir rolün next değeri done olmalı");
          const l = await LiveFlow.open(join(root, "hub", "flows", `${itemName}.yaml`), {
            root, providers: knownProviderSet(),
          });
          return { live: l, flowPath: l.flow.path };
        },
      },
    });
    try {
      const res = await fetch(`${s.url}akis/sec`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-skein-token": s.token },
        body: JSON.stringify({ name: "bozuk" }),
      });
      const v = (await res.json()) as { error: string };
      expect(res.status).toBe(400);
      expect(v.error).toContain("kural 4");

      // Eski akış AYNEN duruyor — "bozuk" diye yarı yüklenmiş bir hâl yok.
      const durum = (await (await fetch(`${s.url}durum`)).json()) as {
        flow: { name: string }; roles: { id: string }[];
      };
      expect(durum.flow.name).toBe("test");
      expect(durum.roles.map((r) => r.id)).toEqual(["coder"]);

      // `flowPath` da AYNEN duruyor mu — bunu `/durum` göstermiyor, ama
      // bir kaydetme denemesi gösterir: hâlâ ESKİ dosyaya (test.yaml)
      // yazmalı. `flowPath` sessizce yeni (var olmayan) ada erken
      // bağlanmış olsaydı bu POST 404/ENOENT ile düşerdi.
      const draft = ((await (await fetch(`${s.url}akis`)).json()) as {
        draft: { description?: string };
      }).draft;
      draft.description = "atomiklik sınaması";
      const writeRes = await fetch(`${s.url}akis/yaz`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-skein-token": s.token },
        body: JSON.stringify(draft),
      });
      expect(writeRes.status).toBe(200);
      expect(await readFile(realFlow.path, "utf8")).toContain("atomiklik sınaması");
    } finally {
      await s.close();
    }
  });

  /**
   * ÜYELİK denetimi kendi başına, `ac()`'in davranışına güvenmeden.
   *
   * `ac()` bilinmeyen bir dosyayı açmaya çalışıp KENDİSİ de fırlatabilir
   * (dosya yok) — o zaman sınama 400'ü görür ama ÜYELİK kontrolünü hiç
   * ÖLÇMEZ, yalnızca `ac`'in kendi hatasını ölçer. Isırması için `ac`
   * burada ÇAĞRILMAMALI diye kurulu: çağrılırsa fırlatır ve sınama
   * kendisi düşer, yani "ac hiç çağrılmadı" iddiasını ayrıca yazmaya
   * gerek yok — mutasyonla doğrulandı (bkz. commit mesajı).
   */
  async function uyelikGozetenSunucu(): Promise<UiServer> {
    await writeFile(join(root, "hub", "flows", "ikinci.yaml"), FLOW2);
    const live = await LiveFlow.open(join(root, "hub", "flows", "test.yaml"), {
      root, providers: knownProviderSet(),
    });
    return serveUi({
      root, queue, topology, flowName: "test", flowHash: realFlow.hash, live,
      flowChoice: {
        list: async () => ["test", "ikinci"],
        open: async () => {
          throw new Error("ac() ÇAĞRILMAMALIYDI — ad listede yoktu, üyelik denetimi onu ac'e hiç ulaştırmamalı");
        },
      },
    });
  }

  // ÜYELİK denetimi: dizgi temizlemek değil, listede olup olmadığını
  // sormak. Kural numarasıyla uğraşmıyoruz — bilinmeyen HER ad aynı
  // kapıdan döner.
  it("bilinmeyen akış adı reddedilir, akış DEĞİŞMEZ", async () => {
    const s = await uyelikGozetenSunucu();
    try {
      const res = await fetch(`${s.url}akis/sec`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-skein-token": s.token },
        body: JSON.stringify({ name: "boyle-bir-akis-yok" }),
      });
      const v = (await res.json()) as { error: string };
      expect(res.status).toBe(400);
      // `ac()` çağrılsaydı kendi hatasıyla (üstteki metin) düşerdi;
      // gördüğümüz mesaj sunucunun KENDİ üyelik reddi olmalı.
      expect(v.error).toContain("Bilinmeyen akış");

      const durum = (await (await fetch(`${s.url}durum`)).json()) as { flow: { name: string } };
      expect(durum.flow.name).toBe("test");
    } finally {
      await s.close();
    }
  });

  // `../` içeren bir ad DİZGİ TEMİZLEYEREK değil, listede YOK diye
  // reddedilmeli — temizleme kuralı bir gün eksik kalır, üyelik kalmaz.
  it("'../' içeren ad reddedilir, akış DEĞİŞMEZ", async () => {
    const s = await uyelikGozetenSunucu();
    try {
      const res = await fetch(`${s.url}akis/sec`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-skein-token": s.token },
        body: JSON.stringify({ name: "../../../etc/passwd" }),
      });
      const v = (await res.json()) as { error: string };
      expect(res.status).toBe(400);
      expect(v.error).toContain("Bilinmeyen akış");

      const durum = (await (await fetch(`${s.url}durum`)).json()) as { flow: { name: string } };
      expect(durum.flow.name).toBe("test");
    } finally {
      await s.close();
    }
  });

  it("jetonsuz seçim isteği 403 ve akış DEĞİŞMİYOR", async () => {
    const s = await flowChoosingServer();
    try {
      const res = await fetch(`${s.url}akis/sec`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "ikinci" }),
      });
      expect(res.status).toBe(403);

      const durum = (await (await fetch(`${s.url}durum`)).json()) as { flow: { name: string } };
      expect(durum.flow.name).toBe("test");
    } finally {
      await s.close();
    }
  });

  it("başka kaynaktan gelen seçim isteği reddedilir", async () => {
    const s = await flowChoosingServer();
    try {
      const res = await fetch(`${s.url}akis/sec`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-skein-token": s.token,
          origin: "https://kotu-site.example",
        },
        body: JSON.stringify({ name: "ikinci" }),
      });
      expect(res.status).toBe(403);

      const durum = (await (await fetch(`${s.url}durum`)).json()) as { flow: { name: string } };
      expect(durum.flow.name).toBe("test");
    } finally {
      await s.close();
    }
  });
});

/**
 * YENİ AKIŞ OLUŞTURMA — `/akis/yaz` ve `/akis/onizleme`nin `yeniAd` alanı.
 *
 * DEVIR.md §4'ün "Yeni akış" iletişim kutusu ve "Kopyala" düğmesi YENİ bir
 * dosya yazmak istiyor, ama SAPMALAR.md §3 bu ikisini de "zaten var olan
 * uçlar" tablosunda sayıyor. Çözüm İKİNCİ bir yazma ucu AÇMIYOR — AYNI
 * /akis/yaz + /akis/onizleme çiftini, hedef dosyayı seçen isteğe bağlı bir
 * `yeniAd` alanıyla genişletiyor (bkz. `hedefAkisYolu`, server.ts). Bu
 * describe hiçbir eski sınamayı bozmadan (üsttekiler hâlâ yeşil) üç şeyi
 * kanıtlıyor: ESKİ davranış `yeniAd` yokken AYNEN duruyor, YENİ dosya
 * gerçekten yazılıyor ve aktif akışı DEĞİŞTİRMİYOR, ve güvenlik (karakter
 * kümesi + benzersizlik) dizgi temizlemeden, üyelikle çalışıyor.
 */
describe("serveUi — yeni akış oluşturma (yeniAd)", () => {
  let s: UiServer;
  const opts = () => ({ root, providers: knownProviderSet() });

  beforeEach(async () => {
    s = await serveUi({
      root, queue, topology, flowName: "test", flowHash: realFlow.hash,
      live: { topology, flow: realFlow, error: null, refresh: async () => {} },
      flowPath: realFlow.path,
      loadOptions: opts(),
      providerIds: ["claude"],
      flowChoice: {
        list: async () => ["test"],
        open: async () => { throw new Error("ac() bu describe'da ÇAĞRILMAMALI"); },
      },
    });
  });
  afterEach(async () => {
    await s.close();
  });

  const send = (filePath: string, bodyText: unknown) =>
    fetch(`${s.url}${filePath}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-skein-token": s.token },
      body: JSON.stringify(bodyText),
    });

  const freshDraft = (itemName: string): FlowDraft => ({
    name: itemName,
    constitution: ["../prompts/base.md"],
    roles: [{
      id: "coder", provider: "claude", workspace: "main",
      prompt: "../../roles/coder.prompt", next: "done",
    }],
    reject: { limit: 2, onExhausted: "gate" },
    audit: { enabled: true, fingerprint: ["task"] },
  });

  it("geçerli yeniAd ile YENİ dosyayı yazar, aktif akışa DOKUNMAZ", async () => {
    const res = await send("akis/yaz", { ...freshDraft("kopya"), newName: "kopya" });
    expect(res.status).toBe(200);

    const newPath = join(root, "hub", "flows", "kopya.yaml");
    expect(await readFile(newPath, "utf8")).toContain("id: coder");
    // Aktif akış (test.yaml) AYNEN duruyor — yazma BAŞKA bir dosyaya gitti.
    const oldContent = await readFile(realFlow.path, "utf8");
    expect(oldContent).not.toContain("copy");
    const v = (await res.json()) as { model: { flow: { name: string } } };
    expect(v.model.flow.name).toBe("test");
  });

  // Önizleme hiçbir koşulda dosyaya dokunmaz — `yeniAd`'lı dal da aynı
  // kuralı taşıyor.
  it("geçerli yeniAd ile önizleme hiçbir dosyaya YAZMAZ", async () => {
    const res = await send("akis/onizleme", { ...freshDraft("kopya"), newName: "kopya" });
    const v = (await res.json()) as { ok: boolean; yaml: string };
    expect(v.ok).toBe(true);
    const newPath = join(root, "hub", "flows", "kopya.yaml");
    await expect(readFile(newPath, "utf8")).rejects.toThrow();
  });

  it("zaten var olan bir ad reddedilir, hiçbir dosya değişmez", async () => {
    const once = await readFile(realFlow.path, "utf8");
    const res = await send("akis/yaz", { ...freshDraft("test"), newName: "test" });
    const v = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(v.error).toContain("zaten kullanılıyor");
    expect(await readFile(realFlow.path, "utf8")).toBe(once);
  });

  // Karakter kümesi DİZGİ TEMİZLEYEREK değil REDDEDİLEREK uygulanıyor —
  // `duzenleAdSanitize` (page.ts) ekranda zaten temizliyor, sunucu burada
  // ikinci bir savunma hattı.
  it("geçersiz karakter içeren yeniAd reddedilir", async () => {
    const res = await send("akis/yaz", { ...freshDraft("Kopya Adı"), newName: "Kopya Adı" });
    const v = (await res.json()) as { error: string };
    expect(res.status).toBe(400);
    expect(v.error).toContain("a-z0-9-");
    const newPath = join(root, "hub", "flows", "Kopya Adı.yaml");
    await expect(readFile(newPath, "utf8")).rejects.toThrow();
  });

  it("akisSecimi verilmemişse yeniAd 404 değil 400 ile reddedilir, hiçbir dosya yazılmaz", async () => {
    const readOnlyNoFlowChoice = await serveUi({
      root, queue, topology, flowName: "test", flowHash: realFlow.hash,
      live: { topology, flow: realFlow, error: null, refresh: async () => {} },
      flowPath: realFlow.path,
      loadOptions: opts(),
    });
    try {
      const res = await fetch(`${readOnlyNoFlowChoice.url}akis/yaz`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-skein-token": readOnlyNoFlowChoice.token },
        body: JSON.stringify({ ...freshDraft("kopya"), newName: "kopya" }),
      });
      expect(res.status).toBe(400);
      const newPath = join(root, "hub", "flows", "kopya.yaml");
      await expect(readFile(newPath, "utf8")).rejects.toThrow();
    } finally {
      await readOnlyNoFlowChoice.close();
    }
  });

  // `yeniAd` YOKKEN davranış ESKİSİYLE AYNEN — bu describe'ın eklediği
  // dal hiçbir eski isteği etkilememeli.
  it("yeniAd verilmezse davranış AYNEN eski: aktif akışın dosyasına yazar", async () => {
    const data = ((await (await fetch(`${s.url}akis`)).json()) as {
      draft: { description?: string };
    }).draft;
    data.description = "yeniAd olmadan";
    const res = await send("akis/yaz", data);
    expect(res.status).toBe(200);
    expect(await readFile(realFlow.path, "utf8")).toContain("yeniAd olmadan");
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
      body: JSON.stringify({ decision: "retry" }),
    });
    expect(res.status).toBe(200);
  });

  it("IPv6 döngü kaynağı da kabul edilir", () => {
    const names = allowedNames("127.0.0.1");
    expect(isOurOwn(`http://[::1]:7777`, names, 7777)).toBe(true);
    expect(isOurOwn(`http://localhost:7777`, names, 7777)).toBe(true);
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
      body: JSON.stringify({ decision: "retry" }),
    });
    expect(res.status).toBe(403);
  });

  // Port eşleşmesi zorunlu: aynı makinedeki BAŞKA bir yerel servis bizim
  // kaynağımız değil.
  it("döngü adı ama yanlış port bizim değil", () => {
    const names = allowedNames("127.0.0.1");
    expect(isOurOwn("http://127.0.0.1:9999", names, 7777)).toBe(false);
    // Portsuz `Host: 127.0.0.1` (port 80) de bizim değil.
    expect(isOurOwn("127.0.0.1", names, 7777)).toBe(false);
  });

  /**
   * `Host` başlığını EZEN ham istek.
   *
   * `fetch()` bunu yapamıyor: `Host` yasaklı başlık, sessizce yok sayılıyor.
   * İlk yazımda bu sınamalar `fetch` kullanıyordu ve HİÇBİR ŞEY
   * sınamıyorlardı — tarayıcı başlığı 127.0.0.1 kalıyordu, yani "yabancı
   * Host reddedilir" iddiası kendi kurduğu durumu hiç kurmuyordu.
   */
  const rawRequest = (filePath: string, host: string): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port: server.port, path: filePath, method: "GET", headers: { Host: host } },
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
    // "/adimlar" (Ajanlar sekmesinin GERÇEKTEN yeni ucu, DEVIR.md §6)
    // BURADA: okuma ucu olması bu denetimden MUAF tutmuyor —
    // tasarim/SAPMALAR.md §3'ün "taşınacak" notu tam bunu söylüyor.
    for (const filePath of ["/", "/durum", "/adimlar?kart=x"]) {
      const res = await rawRequest(filePath, `kotu.example:${server.port}`);
      expect(res.status).toBe(403);
    }
  });

  // Asıl bedel bu: `GET /` sayfaya YAZMA JETONUNU gömüyor, yani rebinding
  // ile okunan bir sayfa yazma hakkını da taşır.
  it("yabancı Host sayfaya gömülü jetonu vermiyor", async () => {
    const res = await rawRequest("/", `kotu.example:${server.port}`);
    expect(res.status).toBe(403);
    expect(res.body).not.toContain(server.token);
  });

  it("döngü adıyla gelen Host geçer", async () => {
    const res = await rawRequest("/", `localhost:${server.port}`);
    expect(res.status).toBe(200);
    expect(res.body).toContain(server.token);
  });

  // HTTP/1.1 `Host`u zorunlu kılıyor; "başlık yoksa geç" demek kapıyı
  // başlığı atlayan her istemciye açmaktı.
  //
  // `http.request` ile sınanamıyor: boş `Host` verince node onu kendisi
  // dolduruyor. Başlıksız istek ancak ham soketle kurulabiliyor.
  it("Host başlığı olmayan istek reddedilir", async () => {
    const answer = await new Promise<string>((resolve, reject) => {
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
    expect(answer).toMatch(/^HTTP\/1\.1 (400|403)/);
  });

  // Joker arayüzde hangi adla erişileceği bilinemez; basılan adres de
  // `http://0.0.0.0:port` olmamalı — o geçerli bir tarayıcı adresi değil.
  it("joker arayüz döngü adına çevrilir", async () => {
    const s = await serveUi({
      root, queue, topology, flowName: realFlow.name, flowHash: realFlow.hash,
      host: "0.0.0.0",
    });
    try {
      expect(jokerArayuz("0.0.0.0")).toBe(true);
      expect(s.url).toContain("127.0.0.1");
      expect(s.url).not.toContain("0.0.0.0");
      expect(allowedNames("0.0.0.0").has("0.0.0.0")).toBe(false);
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
  const open = (bodyText: unknown, heading?: Record<string, string>) =>
    fetch(`${server.url}kart/yeni`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(heading ?? { "x-skein-token": server.token }) },
      body: JSON.stringify(bodyText),
    });

  it("kart açılıyor ve zincirin ilk rolünün kuyruğuna düşüyor", async () => {
    const res = await open({ title: "jitter", task: "retry'a jitter ekle" });

    expect(res.status).toBe(200);
    const data = await res.json() as { card: { id: string; role: string; state: string } };
    expect(data.card.role).toBe("coder");
    expect(data.card.state).toBe("queued");
    // Çekirdek gerçekten yazdı mı — cevabın kendi iddiasına değil kuyruğa bak.
    const theCard = await queue.get(data.card.id);
    expect(theCard?.title).toBe("jitter");
    expect(theCard?.task).toBe("retry'a jitter ekle");
    expect(theCard?.role).toBe("coder");
  });

  it("cevaptaki model yeni kartı içeriyor", async () => {
    const res = await open({ title: "jitter", task: "iş" });
    const data = await res.json() as { card: { id: string }; model: { cards: { id: string }[] } };
    // Ekran kendi kopyasını uydurmuyor: çizdiği model çekirdekten geliyor.
    expect(data.model.cards.map((c) => c.id)).toContain(data.card.id);
  });

  // Boş kart, ajana verilecek metni olmayan bir karttır: tur koşar ve
  // hiçbir şey üretmez. `card -- new` de bunu reddediyor.
  it("başlık ya da iş metni boşsa reddediyor", async () => {
    expect((await open({ title: "", task: "iş" })).status).toBe(400);
    expect((await open({ title: "başlık", task: "   " })).status).toBe(400);
    expect((await open({})).status).toBe(400);
    // Hiçbiri kuyruğa düşmemeli.
    expect(await queue.list()).toEqual([]);
  });

  it("jetonsuz istek reddedilir ve kart AÇILMAZ", async () => {
    const res = await open({ title: "b", task: "g" }, {});
    expect(res.status).toBe(403);
    // Reddedilen bir komut hiçbir şey yazmamalı.
    expect(await queue.list()).toEqual([]);
  });

  it("başka kaynaktan gelen istek reddedilir", async () => {
    const res = await open({ title: "b", task: "g" }, {
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
  const COMMAND = ["node", "tsx", "watch/cli.ts"];
  const FLAGS = ["--model", "claude:m"];
  /** Sunucunun kurması BEKLENEN tam komut. */
  const EXPECTED = [...COMMAND, "test", "--serve", ...FLAGS];

  /** Başlatılan sahte süreçleri kaydeder. */
  function stubbed() {
    const calls: string[][] = [];
    const killed: (string | undefined)[] = [];
    const bitirenler: (() => void)[] = [];
    return {
      calls,
      killed,
      /** Sürecin gerçekten bittiğini bildirir. */
      finish: () => bitirenler.forEach((cb) => cb()),
      spawn: (argv: string[]) => {
        calls.push(argv);
        return {
          pid: 4242,
          kill: (sig?: string) => killed.push(sig),
          // Sahte süreç KENDİLİĞİNDEN bitmiyor: gerçeğinde de durdurma
          // anlık değil, gözcü süren turu bitirince çıkıyor.
          onExit: (cb: () => void) => bitirenler.push(cb),
        };
      },
    };
  }

  async function gozculu(): Promise<{ srv: UiServer; s: ReturnType<typeof stubbed> }> {
    const s = stubbed();
    const srv = await serveUi({
      root, queue, topology, flowName: "test", flowHash: realFlow.hash,
      watcher: { command: COMMAND, watcherFlagList: FLAGS, spawn: s.spawn as never },
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
      // Akış adı ekranın baktığı akıştan, BAYRAKLAR terminalden —
      // düğme bayrakları ne seçiyor ne değiştiriyor. Düğmenin model
      // seçebilmesi, ekranın yetkisini sessizce büyütmek olurdu.
      expect(s.calls).toEqual([EXPECTED]);
    } finally {
      await srv.close();
    }
  });

  it("jetonsuz başlatma reddedilir ve SÜREÇ BAŞLAMAZ", async () => {
    const { srv, s } = await gozculu();
    try {
      const res = await fetch(`${srv.url}gozcu/baslat`, { method: "POST" });
      expect(res.status).toBe(403);
      expect(s.calls).toEqual([]);
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
      expect(s.calls).toEqual([]);
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
      const first = await fetch(`${srv.url}gozcu/baslat`, {
        method: "POST", headers: { "x-skein-token": srv.token },
      });
      expect(first.status).toBe(200);
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
      expect((await ikinci.json() as { error: string }).error).toMatch(/Zaten bir gözcü açık/);
      // İkinci süreç BAŞLAMADI.
      expect(s.calls).toHaveLength(1);
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
      expect(s.killed).toEqual(["SIGTERM"]);
      // Durdurma ANLIK DEĞİL ve cevap bunu SÖYLEMEK zorunda: gözcü süren
      // turu bitirip çıkıyor. Söylemezsek kullanıcı hapta hâlâ "açık"
      // görüp düğmenin çalışmadığını sanar — gerçek tarayıcıda tam olarak
      // bu oldu.
      const data = await res.json() as { message?: string };
      expect(data.message).toMatch(/KOŞAN TURU bitirip/);
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
      expect(s.killed).toEqual(["SIGTERM", "SIGTERM"]);
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
      s.finish();
      const res = await fetch(`${srv.url}gozcu/durdur`, {
        method: "POST", headers: { "x-skein-token": srv.token },
      });
      expect(res.status).toBe(409);
      expect((await res.json() as { error: string }).error).toMatch(/Durdurulacak gözcü yok/);
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
      const data = await res.json() as { error: string };
      expect(data.error).toMatch(/bu ekran başlatmadı/);
      expect(data.error).toMatch(/Ctrl-C/);
    } finally {
      await srv.close();
    }
  });

  // Bayrak verilmeden açılan ekran bugünkü hâlinde kalıyor: akış
  // düzenlemeyle aynı kural — ekranın yetkisi onu açan komutun verdiği kadar.
  it("gözcü bayrağı verilmeden açılan ekranda uç 404", async () => {
    const srv = await serveUi({
      root, queue, topology, flowName: "test", flowHash: realFlow.hash,
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
    expect(s.killed).toEqual(["SIGTERM"]);
  });

  /**
   * GÖZCÜ AYARI SAYFAYA GÖMÜLÜ (kart c-20261105-92d731, DEVIR.md §2'nin
   * "unmanaged" durumu). `page.test.ts` renderPage()'in İKİNCİ parametresini
   * birim sınıyor; bu test o ikinci parametrenin SUNUCUDAN DOĞRU geldiğini
   * doğruluyor — iki yarı birlikte "ekran gerçekten bilir" iddiasını kapatır.
   */
  it("GET / — gözcü bayraklarıyla açılan ekran GOZCU_AYAR'ı bayraklarla gömer", async () => {
    const { srv } = await gozculu();
    try {
      const html = await (await fetch(srv.url)).text();
      expect(html).toContain('const WATCHER_CONFIG = {"watcherFlagList":["--model","claude:m"]};');
    } finally {
      await srv.close();
    }
  });

  it("GET / — bayraksız açılan ekranda GOZCU_AYAR null", async () => {
    const srv = await serveUi({ root, queue, topology, flowName: "test", flowHash: realFlow.hash });
    try {
      const html = await (await fetch(srv.url)).text();
      expect(html).toContain("const WATCHER_CONFIG = null;");
    } finally {
      await srv.close();
    }
  });
});

/**
 * GET /gozcu/log — ".skein/gozcu.log" son satırları (DEVIR.md §2, kart
 * c-20261105-92d731). Okuma ucu TOKEN GEREKTİRMİYOR — diğer okuma uçlarıyla
 * (/durum, /promptlar) AYNI kural, yalnızca yazma korunuyor (SAPMALAR §2.3).
 */
describe("GET /gozcu/log — gözcü günlüğü", () => {
  it("dosya yoksa boş liste döner, hata DEĞİL", async () => {
    const srv = await serveUi({ root, queue, topology, flowName: "test", flowHash: realFlow.hash });
    try {
      const res = await fetch(`${srv.url}gozcu/log`);
      expect(res.status).toBe(200);
      expect((await res.json() as { lines: unknown[] }).lines).toEqual([]);
    } finally {
      await srv.close();
    }
  });

  it("satırları saat/mesaj/hata olarak ayrıştırıp döner", async () => {
    await mkdir(join(root, ".skein"), { recursive: true });
    await writeFile(
      join(root, ".skein", "gozcu.log"),
      "09:12 gözcü açık · pid 48213\n09:13 ✗ kaçak döngü\n",
    );
    const srv = await serveUi({ root, queue, topology, flowName: "test", flowHash: realFlow.hash });
    try {
      const res = await fetch(`${srv.url}gozcu/log`);
      const data = await res.json() as { lines: { at: string; message: string; error: boolean }[] };
      expect(data.lines).toEqual([
        { at: "09:12", message: "gözcü açık · pid 48213", error: false },
        { at: "09:13", message: "✗ kaçak döngü", error: true },
      ]);
    } finally {
      await srv.close();
    }
  });
});

/**
 * GOZCULOGSATIRIAYRISTIR — tek bir günlük satırının ayrıştırılması. SAF.
 */
describe("gozcuLogSatiriAyristir — tek satır ayrıştırma", () => {
  it("'HH:MM mesaj' biçimini ayırır", () => {
    expect(parseWatcherLogLine("14:05 kuyruk boş, bekleniyor")).toEqual({
      at: "14:05", message: "kuyruk boş, bekleniyor", error: false,
    });
  });

  // SINIR: mesaj "✗" ile başlıyorsa hata:true — bu tek işaret
  // satirYaziciKur'un STDERR'den gelen satırlara EKLEDİĞİ işaret.
  it("mesaj '✗' ile başlıyorsa hata:true", () => {
    expect(parseWatcherLogLine("14:06 ✗ kaçak döngü").error).toBe(true);
  });

  // BİÇİME UYMAYAN satır SESSİZCE ATILMIYOR: saat boş, mesaj ham satırın
  // kendisi — BİLDİRİLMEYEN SIFIR DEĞİLDİR, ayrıştıramadığımızı gizlemek
  // de aynı kusur sınıfı.
  it("biçime uymayan satırı ham hâliyle gösterir", () => {
    expect(parseWatcherLogLine("saatsiz ham satır")).toEqual({
      at: "", message: "saatsiz ham satır", error: false,
    });
  });
});

/** GOZCULOGKUYRUK — dosyadan son N satırı okur. */
describe("gozcuLogKuyruk — dosyadan son satırlar", () => {
  it("dosya yoksa boş liste", async () => {
    expect(await watcherLogQueue(join(root, "yok-boyle-dosya.log"))).toEqual([]);
  });

  it("satır sayısı n'den fazlaysa yalnızca SON n'i döner", async () => {
    const filePath = join(root, "cok-satirli.log");
    const lines = Array.from({ length: 5 }, (_, i) => `09:${String(i).padStart(2, "0")} satır ${i}`);
    await writeFile(filePath, lines.join("\n") + "\n");
    const result = await watcherLogQueue(filePath, 2);
    expect(result.map((s) => s.message)).toEqual(["satır 3", "satır 4"]);
  });
});

/**
 * SATIRYAZICIKUR — bir alt sürecin çıktısını saat damgalı satırlara bölen
 * yazıcı (kart c-20261105-92d731). Sahte `WritableStream` ile `write()`
 * çağrılarını yakalıyor — gerçek bir alt süreç başlatmadan.
 */
describe("satirYaziciKur — alt süreç çıktısını saat damgalı satırlara böler", () => {
  function fakeLog(): { writtenList: string[]; log: NodeJS.WritableStream } {
    const writtenList: string[] = [];
    return { writtenList, log: { write: (s: string) => { writtenList.push(s); return true; } } as NodeJS.WritableStream };
  }

  it("tamamlanmış satırı SAAT DAMGASIYLA yazar", () => {
    const { writtenList, log } = fakeLog();
    makeLineWriter(log, false)(Buffer.from("kuyruk boş, bekleniyor\n"));
    expect(writtenList).toHaveLength(1);
    expect(writtenList[0]).toMatch(/^\d{2}:\d{2} kuyruk boş, bekleniyor\n$/);
  });

  // STDERR kaynaklı satır "✗ " ile işaretlenir — gozcuLogSatiriAyristir
  // bunu "hata" sayıyor. Zaten "✗" ile başlıyorsa İKİNCİ bir işaret
  // EKLENMİYOR ("✗ ✗ ..." çiftlenmesin).
  it("stdout satırını İŞARETLEMEZ, stderr satırını '✗ ' ile işaretler", () => {
    const stdout = fakeLog();
    makeLineWriter(stdout.log, false)(Buffer.from("normal satır\n"));
    expect(stdout.writtenList[0]).toMatch(/normal satır\n$/);
    expect(stdout.writtenList[0]).not.toContain("✗");

    const stderr = fakeLog();
    makeLineWriter(stderr.log, true)(Buffer.from("patladı\n"));
    expect(stderr.writtenList[0]).toMatch(/✗ patladı\n$/);
  });

  it("stderr satırı ZATEN '✗' ile başlıyorsa işareti ÇİFTLEMEZ", () => {
    const { writtenList, log } = fakeLog();
    makeLineWriter(log, true)(Buffer.from("✗ kaçak döngü\n"));
    expect(writtenList[0]).toMatch(/✗ kaçak döngü\n$/);
    expect(writtenList[0]).not.toContain("✗ ✗");
  });

  // SATIR TAMAMLANMADAN yazılmaz: tek bir satır İKİ `data` olayına
  // bölünürse (büyük bir çıktı parçalanmışsa) ortasına saat damgası
  // SIKIŞMAMALI.
  it("satır İKİ 'data' olayına bölünse de TEK satır olarak yazar", () => {
    const { writtenList, log } = fakeLog();
    const writeIt = makeLineWriter(log, false);
    writeIt(Buffer.from("yarım "));
    expect(writtenList).toEqual([]); // satır sonu gelmeden HİÇ yazılmaz
    writeIt(Buffer.from("satır\n"));
    expect(writtenList).toHaveLength(1);
    expect(writtenList[0]).toMatch(/yarım satır\n$/);
  });

  it("sonu '\\n' olmayan kalıntı yazılmaz", () => {
    const { writtenList, log } = fakeLog();
    makeLineWriter(log, false)(Buffer.from("tamamlanmamış"));
    expect(writtenList).toEqual([]);
  });
});

