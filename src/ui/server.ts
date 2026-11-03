import { join } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { newCard } from "../card/card.js";
import { QueueError, type ReleaseDecision } from "../card/queue.js";
import { checkDraft, fromFlow, writeDraft, type FlowDraft } from "../flow/draft.js";
import { loadFlow, type Flow, type LoadOptions } from "../flow/load.js";
import { closeOrphan } from "../card/orphan.js";
import { releaseCard } from "../card/release.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { buildDetail, buildModel, type DetailOptions, type UiModel } from "./model.js";
import { renderPage } from "./page.js";

export interface UiServer {
  port: number;
  url: string;
  /** Yazma çağrılarının taşıması gereken jeton. */
  token: string;
  close: () => Promise<void>;
}

export interface ServeUiOptions extends DetailOptions {
  /**
   * Akışın yaşayan kaynağı. Verilirse her okumadan önce yokluyor: akış
   * dosyası değiştiyse ekran yeni sütunları çiziyor, geçersizse eskisiyle
   * çizmeye devam edip gerekçeyi gösteriyor.
   */
  live?: {
    topology: TopologySnapshot;
    flow: Flow;
    error: string | null;
    refresh: () => Promise<unknown>;
  };
  /**
   * Akış dosyasının yolu ve yükleme seçenekleri — ekrandan düzenleme için.
   * Verilmezse düzenleme uçları 404 döner (ekran salt okunur kalır).
   */
  flowPath?: string;
  loadOptions?: LoadOptions;
  /** Düzenleyicide seçilebilecek sağlayıcılar. */
  providerIds?: string[];
  /** 0 = boş port seç. */
  port?: number;
  /**
   * Dinlenecek arayüz. Varsayılan 127.0.0.1 ve bu KASITLI: ekran depo
   * durumunu, kart metinlerini ve ret gerekçelerini gösteriyor. Yerel bir
   * araç, ağa açılan bir servis değil.
   */
  host?: string;
  /** Test edilebilirlik için sabitlenebilir; varsayılan rastgele. */
  token?: string;
}

const DECISIONS: readonly ReleaseDecision[] = ["forward", "back", "retry"];

/** Gövdeyi okur; 64 KiB üstünü reddeder. */
async function readBody(req: IncomingMessage): Promise<string> {
  const parts: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > 64 * 1024) throw new Error("gövde çok büyük");
    parts.push(buf);
  }
  return Buffer.concat(parts).toString("utf8");
}

/**
 * Bize ait sayılan ana bilgisayar adları.
 *
 * `127.0.0.1` ile `localhost` AYNI makinedir ama AYNI ad değildir, ve
 * tarayıcı adres çubuğunda yazanı gönderir. Eski kod kendi adresini
 * DİNLENEN ARAYÜZDEN kuruyordu (`http://127.0.0.1:7777`), yani kullanıcı
 * `http://localhost:7777` açtığında — belgelenmiş, olağan kullanım — her
 * yazma ucu 403'e düşüyordu ve araç sessizce yalnızca-okur oluyordu.
 * Sebebi de kullanıcı için anlamsızdı: "beklenmeyen kaynak".
 *
 * Joker arayüzde (`0.0.0.0`) hangi adla erişileceği BİLİNEMEZ, o yüzden
 * yalnızca döngü adları kabul ediliyor ve açılışta uyarı basılıyor. Bu bir
 * gerileme değil: eski kod orada `http://0.0.0.0:port` arıyordu, yani
 * yazma hiçbir koşulda çalışmıyordu — fark, artık sebebin yazılı olması.
 */
const DONGU_ADLARI = ["127.0.0.1", "localhost", "[::1]", "::1"] as const;

export function jokerArayuz(host: string): boolean {
  return host === "0.0.0.0" || host === "::" || host === "";
}

export function izinliAdlar(host: string): Set<string> {
  const out = new Set<string>(DONGU_ADLARI);
  // Açıkça yazılmış bir ad varsa o da bizim: `--host` ile ağa açmayı
  // seçen kullanıcı yerel-araç varsayımından bilerek çıkıyor.
  if (!jokerArayuz(host)) out.add(host);
  return out;
}

/** `ad:port` ya da `http://ad:port` bize mi ait. */
export function bizeAit(
  raw: string | undefined, adlar: Set<string>, port: number,
): boolean {
  if (typeof raw !== "string" || raw === "") return false;
  const metin = raw.includes("://") ? raw : `http://${raw}`;
  let url: URL;
  try {
    url = new URL(metin);
  } catch {
    return false;
  }
  // Port BOŞ olamaz: `Host: 127.0.0.1` (port 80) bizim portumuz değil.
  if (url.port !== String(port)) return false;
  return adlar.has(url.hostname);
}

/**
 * Bu istek gerçekten BİZE mi geldi — DNS rebinding kapısı.
 *
 * Sunucu 127.0.0.1'e bağlı ama bu, TARAYICI ÜZERİNDEN erişimi engellemiyor:
 * saldırganın alan adı 127.0.0.1'e yeniden bağlanırsa (DNS rebinding)
 * `http://kotu.example:<port>/` saldırganın sayfasıyla aynı kaynak sayılır
 * ve `fetch("/durum")` cevabını OKUYABİLİR — kart başlıkları, ret
 * gerekçeleri, commit hash'leri, ve `fetch("/")` ile sayfaya gömülü YAZMA
 * JETONU.
 *
 * Tek yer gerçeği `Host` başlığı: rebinding'de tarayıcı saldırganın adını
 * gönderir, bizim adımızı gönderemez. Bu yüzden denetim OKUMA uçlarında da
 * uygulanıyor — jeton yazma uçlarını koruyor, okuma uçlarını hiçbir şey
 * korumuyordu.
 *
 * Başlıksız istek reddediliyor: HTTP/1.1 `Host`u zorunlu kılıyor ve
 * "başlık yoksa geç" demek kapıyı başlığı atlayan her istemciye açmaktı.
 */
function bizeMiGeldi(req: IncomingMessage, adlar: Set<string>, port: number): boolean {
  return bizeAit(req.headers["host"], adlar, port);
}

/**
 * Bu istek gerçekten BİZİM sayfamızdan mı geliyor.
 *
 * Yerel bir sunucuya yazma eklemek, tarayıcıda açık HERHANGİ bir sitenin
 * `http://127.0.0.1:<port>`'a POST atabilmesi demek — yani kullanıcının
 * haberi olmadan bir kapıyı açabilmesi. İki kapı birden:
 *
 * 1. **Jeton.** Sayfa açılışta gömülüyor; başka bir kaynaktaki JavaScript
 *    sayfayı okuyamadığı için jetonu öğrenemez.
 * 2. **Özel başlık.** Özel başlık taşıyan çapraz kaynak isteği önce
 *    preflight ister; biz preflight'a izin vermiyoruz.
 *
 * `Origin` varsa ayrıca kendi adresimizle eşleşmeli.
 */
function yetkili(
  req: IncomingMessage, token: string, adlar: Set<string>, port: number,
): string | null {
  if (req.headers["x-skein-token"] !== token) return "jeton yok ya da yanlış";
  const origin = req.headers["origin"];
  if (typeof origin === "string" && !bizeAit(origin, adlar, port)) {
    return `beklenmeyen kaynak: ${origin}`;
  }
  return null;
}

/**
 * Ekranın arkasındaki yerel sunucu.
 *
 * İki uç nokta var ve ikisi de OKUR:
 *
 *   GET  /                    sayfa
 *   GET  /durum               panonun modeli
 *   GET  /kart/<id>           kartın izi + devredilen commit'in diff özeti
 *   POST /kart/<id>/birak     kapıdaki kartı karara bağlar
 *   POST /kart/<id>/kapat     akışta karşılığı kalmamış kartı kapatır
 *   GET  /akis                düzenleyicinin başlangıç hâli
 *   POST /akis/onizleme       taslağı DOSYAYA YAZMADAN doğrular
 *   POST /akis/yaz            geçerli taslağı atomik yazar
 *
 * Yazan uç noktalar KOMUT gönderiyor: yüzey kendi kopyasını
 * güncellemiyor, `queue.release()` çağırıyor ve cevabı çekirdeğin ürettiği
 * yeni durumdan okuyor (ARCHITECTURE, değişmez 1). Çekirdek reddederse
 * (kaçış kapısından ileri bırakma) mesaj kullanıcıya aynen gider.
 */
export async function serveUi(options: ServeUiOptions): Promise<UiServer> {
  const host = options.host ?? "127.0.0.1";
  const token = options.token ?? randomBytes(24).toString("hex");
  const adlar = izinliAdlar(host);
  // Port `listen`den SONRA biliniyor (0 = boş port seç), ama istek
  // işleyicisi ondan önce kuruluyor. Kapanış üzerinden okumak, portu iki
  // yerde tutmaktan iyi: bu projede aynı bilginin iki kopyası üç kez kusur
  // doğurdu.
  let dinlenenPort = 0;
  const portu = (): number => dinlenenPort;

  /** Yaşayan akış varsa yoklar ve o anki topolojiyle seçenekleri kurar. */
  const guncel = async (): Promise<ServeUiOptions> => {
    const live = options.live;
    if (live === undefined) return options;
    await live.refresh();
    return {
      ...options,
      topology: live.topology,
      flowName: live.flow.name,
      flowHash: live.flow.hash,
      flowError: live.error,
    };
  };

  const server: Server = createServer((req, res) => {
    // DNS REBINDING KAPISI — okuma uçları da dahil, her istekte.
    //
    // Jeton yalnızca yazmayı koruyordu; okuma uçlarını hiçbir şey
    // korumuyordu ve `GET /` sayfaya gömülü jetonu veriyordu. Yani
    // rebinding ile bir saldırgan sayfası önce jetonu okuyup sonra
    // yazabilirdi.
    if (!bizeMiGeldi(req, adlar, portu())) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("beklenmeyen ana bilgisayar adı\n");
      return;
    }

    const path = (req.url ?? "/").split("?")[0];

    const birak = path === undefined ? null : /^\/kart\/([^/]+)\/birak$/.exec(path);
    const kapat = path === undefined ? null : /^\/kart\/([^/]+)\/kapat$/.exec(path);

    if (req.method === "POST" && path === "/kart/yeni") {
      const hata = yetkili(req, token, adlar, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      readBody(req)
        .then(async (body) => {
          const istek = JSON.parse(body === "" ? "{}" : body) as Record<string, unknown>;
          // Boşluk denetimi BURADA YOK ve bu bilinçli: `newCard` zaten
          // reddediyor ve mesajı daha iyi ("role verilecek iş bu"). Buraya
          // ikinci bir kontrol yazmıştım; mutasyon sınaması onun hiçbir şeyi
          // değiştirmediğini gösterdi — aynı kural iki yerde, bu deponun en
          // sık tekrarlayan kusur sınıfı. Çekirdeğin hatası 400 ile aynen
          // kullanıcıya gidiyor.
          const baslik = typeof istek["baslik"] === "string" ? istek["baslik"] : "";
          const gorev = typeof istek["gorev"] === "string" ? istek["gorev"] : "";

          // Topoloji YAŞAYAN dosyadan: kart açılırken donan hash budur.
          const o = await guncel();

          // AKIŞ GEÇERSİZSE KART AÇILMAZ.
          //
          // Ekran, akış dosyası bozulduğunda ESKİ topolojiyle çizmeye devam
          // ediyor ve gerekçeyi gösteriyor — okumak için doğru davranış. Ama
          // kart açmak YAZMAK: o eski topoloji karta DONAR ve kart,
          // operatörün ekranda düzeltmekte olduğu akışın artık var olmayan
          // bir hâlini taşır. Sessizce açmak, "bayat topoloji" kusurunu
          // ekrandan tek tıkla üretilebilir yapardı.
          if (o.flowError !== undefined && o.flowError !== null) {
            throw new Error(
              `Ak\u0131\u015f \u015fu an ge\u00e7ersiz, kart a\u00e7\u0131lmad\u0131: ${o.flowError}\n\n` +
                `  Kart a\u00e7\u0131lsayd\u0131 ESK\u0130 topoloji ona donard\u0131. \u00d6nce ak\u0131\u015f\u0131 d\u00fczelt.`,
            );
          }

          const card = await o.queue.add(
            newCard({ title: baslik, task: gorev, topology: o.topology }),
          );
          return { card, model: await buildModel(o) };
        })
        .then(({ card, model }) => {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({
            kart: { id: card.id, title: card.title, role: card.role, state: card.state },
            model,
          }));
        })
        .catch((error: unknown) => {
          const kod = error instanceof QueueError ? 409 : 400;
          res.writeHead(kod, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        });
      return;
    }

    if (req.method === "POST" && (path === "/akis/onizleme" || path === "/akis/yaz")) {
      const hata = yetkili(req, token, adlar, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      const flowPath = options.flowPath;
      const loadOptions = options.loadOptions;
      if (flowPath === undefined || loadOptions === undefined) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata: "Bu ekran akış düzenlemeye açık değil." }));
        return;
      }
      const yaz = path === "/akis/yaz";
      readBody(req)
        .then(async (body) => {
          const draft = JSON.parse(body === "" ? "{}" : body) as FlowDraft;
          // Önizleme YAZMAZ: ekranda denenen her taslak diske düşseydi gözcü
          // yarım taslakları okurdu.
          if (!yaz) {
            const sonuc = await checkDraft(flowPath, draft, loadOptions);
            res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify(sonuc));
            return;
          }
          const sonuc = await writeDraft(flowPath, draft, loadOptions);
          if (!sonuc.ok) {
            res.writeHead(409, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ hata: sonuc.message }));
            return;
          }
          // Yazdıktan sonra model YENİDEN kuruluyor: yeni topoloji zaten
          // `live.refresh()` ile okunacak, ekran onu çizsin.
          const model = await buildModel(await guncel());
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ...sonuc, model }));
        })
        .catch((error: unknown) => {
          res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        });
      return;
    }

    if (req.method === "POST" && kapat !== null) {
      const hata = yetkili(req, token, adlar, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      const id = decodeURIComponent(kapat[1] as string);
      guncel()
        .then(async (o) => {
          // Hangi akışa bakılacağı KARTIN KENDİSİNDEN okunuyor, ekranın
          // açıldığı akıştan değil. `card -- kapat` bunu zaten böyle
          // yapıyordu; ekran kendi tek akışını geçiriyor ve başka akışın
          // SAĞLAM kartını "akışta rolü yok" diye kapatabiliyordu.
          const mevcut = await o.queue.get(id);
          const kendiAkisi = mevcut === null
            ? o.topology
            : await loadFlow(join(o.root, "hub", "flows", `${mevcut.topology.flow}.yaml`), {
              root: o.root, providers: knownProviderSet(),
            }).then((flow) => snapshot(flow, o.root)).catch(() => null);
          const { card, reason } = await closeOrphan(o.root, o.queue, kendiAkisi, id, o.logPath);
          return { card, reason, model: await buildModel(o) };
        })
        .then(({ card, reason, model }) => {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ kart: { id: card.id, state: card.state }, reason, model }));
        })
        .catch((error: unknown) => {
          const kod = error instanceof QueueError ? 409 : 400;
          res.writeHead(kod, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        });
      return;
    }

    if (req.method === "POST" && birak !== null) {
      const hata = yetkili(req, token, adlar, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      const id = decodeURIComponent(birak[1] as string);
      readBody(req)
        .then(async (body) => {
          const karar = (JSON.parse(body === "" ? "{}" : body) as { karar?: unknown }).karar;
          if (karar !== undefined && !DECISIONS.includes(karar as ReleaseDecision)) {
            throw new QueueError(`Bilinmeyen karar: ${String(karar)}`);
          }
          // Yüzey kendi kopyasını güncellemiyor: çekirdeğe komut gidiyor ve
          // cevap, çekirdeğin ürettiği YENİ durumdan okunuyor.
          const { card } = await releaseCard(
            options.root,
            options.queue,
            id,
            karar as ReleaseDecision | undefined,
            options.logPath,
          );
          const model = await buildModel(await guncel());
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ kart: { id: card.id, role: card.role, state: card.state }, model }));
        })
        .catch((error: unknown) => {
          // Çekirdeğin reddi kullanıcıya AYNEN gider: "kaçış kapısından ileri
          // bırakılamaz" mesajı gerekçesini ve çıkış yolunu zaten söylüyor.
          const kod = error instanceof QueueError ? 409 : 400;
          res.writeHead(kod, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        });
      return;
    }

    if (req.method !== "GET") {
      res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      res.end("Bu uç nokta yalnızca okur.");
      return;
    }

    if (path === "/akis") {
      // Düzenleyicinin başlangıç hâli: yaşayan akışın taslak karşılığı.
      guncel().then(
        async (o) => {
          // Taslak yaşayan AKIŞTAN kuruluyor, dondurulmuş topolojiden değil:
          // kapı mesajları ve yol biçimi yalnızca akışta tam.
          const draft = options.flowPath === undefined || options.live === undefined
            ? null
            : fromFlow(options.live.flow);
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify({ draft, providers: options.providerIds ?? [] }));
        },
        (error: unknown) => {
          res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        },
      );
      return;
    }

    if (path === "/durum") {
      guncel().then(buildModel).then(
        (model: UiModel) => {
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            // Model her saniye değişiyor; bayat cevap ekranı yalan söyletir.
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(model));
        },
        (error: unknown) => {
          // Okuma hatası ekranı çökertmemeli: kart dosyası bozuksa bunu
          // söyleyen bir ekran, boş bir ekrandan iyidir.
          res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        },
      );
      return;
    }

    if (path !== undefined && path.startsWith("/kart/")) {
      const id = decodeURIComponent(path.slice("/kart/".length));
      guncel().then((o) => buildDetail(o, id)).then(
        (detail) => {
          if (detail === null) {
            res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ hata: `Kart yok: ${id}` }));
            return;
          }
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify(detail));
        },
        (error: unknown) => {
          res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        },
      );
      return;
    }

    if (path === "/" || path === "/index.html") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        // Jeton gömülü: sayfa önbelleğe alınırsa eski jetonla açılır.
        "cache-control": "no-store",
      });
      res.end(renderPage(token));
      return;
    }

    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("yok");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 0, host, resolve);
  });

  const port = (server.address() as AddressInfo).port;
  dinlenenPort = port;
  // Basılan adres joker arayüzde `http://0.0.0.0:port` olurdu ve o geçerli
  // bir tarayıcı adresi değil; döngü adına çevriliyor.
  const adres = `http://${jokerArayuz(host) ? "127.0.0.1" : host}:${port}`;
  return {
    port,
    token,
    url: `${adres}/`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
