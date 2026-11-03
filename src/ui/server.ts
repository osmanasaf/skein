import { join } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createWriteStream } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { newCard } from "../card/card.js";
import { QueueError, type ReleaseDecision } from "../card/queue.js";
import { checkDraft, fromFlow, writeDraft, type FlowDraft } from "../flow/draft.js";
import { loadFlow, type Flow, type LoadOptions } from "../flow/load.js";
import { closeOrphan } from "../card/orphan.js";
import { releaseCard } from "../card/release.js";
import { LAYER_MARK } from "../prompt/assemble.js";
import { spawnPortable } from "../proc/process.js";
import { liveLock } from "../watch/lock.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { buildDetail, buildModel, type DetailOptions, type UiModel } from "./model.js";
import { renderPage } from "./page.js";

/** Ekranın baktığı akışın yaşayan hâli. */
export interface CanliAkis {
  topology: TopologySnapshot;
  flow: Flow;
  error: string | null;
  refresh: () => Promise<unknown>;
}

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
  live?: CanliAkis;
  /**
   * Akışı EKRANDAN değiştirmek.
   *
   * Ekran bugüne kadar açılışta verilen TEK akışa bağlıydı: başka akışa
   * bakmak için ekranı kapatıp komutu yeniden yazmak gerekiyordu. "Her
   * şeyi önyüzden" hedefinde bu, kabuğu ne seçersek seçelim duran bir
   * engel — masaüstü uygulaması da olsa akış seçimi arka uçta olmalı.
   *
   * Verilmezse `GET /akislar` boş liste, `POST /akis/sec` 404 döner:
   * ekranın yetkisi, onu açan komutun verdiği kadar.
   */
  akisSecimi?: {
    /** Seçilebilecek akış adları. */
    listele: () => Promise<string[]>;
    /** Adı verilen akışı açar. Başarısızsa FIRLATIR ve eskisi durur. */
    ac: (ad: string) => Promise<{ live: CanliAkis; flowPath: string }>;
  };
  /**
   * Akış dosyasının yolu ve yükleme seçenekleri — ekrandan düzenleme için
   * (akış YAML'ı ve rol promptları). Verilmezse düzenleme uçları 404 döner
   * (ekran salt okunur kalır).
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
  /**
   * Gözcüyü EKRANDAN başlatmak/durdurmak.
   *
   * Verilmezse ilgili uçlar 404 döner — akış düzenlemeyle aynı kural:
   * ekranın yetkisi, onu açan komutun verdiği kadardır.
   *
   * `argv` UI BAŞLATILIRKEN terminalde kuruldu ve düğme onu SEÇEMİYOR,
   * yalnızca çalıştırıyor. Bu kasıtlı: model seçimi ve araç listesi para
   * harcatan parametreler. Bir düğmenin onları seçmesi, ekranın yetkisini
   * sessizce büyütmek olurdu — ekran bugün ne okuyup ne yazabiliyorsa,
   * gözcü düğmesi de o sınırın içinde kalmalı.
   */
  gozcu?: {
    /** Gözcüyü çalıştıran komut, akış adından ÖNCEKİ kısım. */
    komut: string[];
    /**
     * Gözcüye geçirilecek bayraklar — model, araçlar, izin modu.
     *
     * AKIŞ ADI burada YOK: onu ekranın o an baktığı akış belirliyor, yoksa
     * akış değiştirince düğme hâlâ eskisini koştururdu. Güvenlik özelliği
     * bozulmuyor: para harcatan parametreler (model, araç listesi) hâlâ
     * yalnızca bu listede ve onu terminal kuruyor. Akış ise zaten ekranın
     * seçebildiği, deponun kendi dosyalarından biri.
     */
    bayraklar: string[];
    /** Test edilebilirlik için; varsayılan gerçek süreç başlatma. */
    spawn?: (argv: string[]) => GozcuSurec;
  };
}

/** Başlatılan gözcü sürecinin ekranın ihtiyaç duyduğu kadarı. */
export interface GozcuSurec {
  pid: number | undefined;
  kill: (signal?: NodeJS.Signals) => void;
  /**
   * Süreç GERÇEKTEN bittiğinde çağrılır.
   *
   * Durdurma anlık değil: gözcü sinyali alınca süren ajan turunu bitirip
   * çıkıyor (kendi çıktısı da bunu söylüyor). Bu yüzden "öldürdüm" deyip
   * referansı atmak yanlıştı — ekran gözcüyü unutuyor, ikinci basış
   * "bu gözcüyü bu ekran başlatmadı" diyordu. Referans, süreç gerçekten
   * bitince bırakılıyor.
   */
  onExit: (cb: () => void) => void;
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

/** `?ad=deger` sorgu dizgisinden bir alanı okur; yoksa boş metin. */
function queryParam(req: IncomingMessage, name: string): string {
  const raw = req.url ?? "/";
  const i = raw.indexOf("?");
  if (i === -1) return "";
  return new URLSearchParams(raw.slice(i + 1)).get(name) ?? "";
}

/**
 * Akışın BİLDİRDİĞİ prompt dosyaları: her rolün promptu + anayasa katmanları.
 *
 * Liste TOPOLOJİDEN türetilir, depodaki her .md dosyasından değil — akış
 * değişince (constitution ya da roller) liste de değişir. Bu liste aynı
 * zamanda yazma ve okuma uçlarının YOL BEYAZ LİSTESİ: `yol` istemciden
 * geliyor ve burada AYNEN var olup olmadığına bakılıyor, dizgi temizlenerek
 * değil — temizleme kuralı bir gün eksik kalır, üyelik kalmaz.
 *
 * Etiketler `promptLayers`in (flow/snapshot.ts) kullandığı adlandırmayla
 * aynı: "anayasa:N" ve "rol:<id>".
 */
function promptListesi(topology: TopologySnapshot): { etiket: string; yol: string }[] {
  const liste: { etiket: string; yol: string }[] = [];
  topology.constitution.forEach((yol, i) => liste.push({ etiket: `anayasa:${i + 1}`, yol }));
  topology.roles.forEach((rol) => liste.push({ etiket: `rol:${rol.id}`, yol: rol.prompt }));
  return liste;
}

/**
 * Yazılacak prompt metni, akışın kendi kurallarını ihlal ediyor mu — bkz.
 * `flow/load.ts` `checkPromptFile` (kural 9, 11) ve `prompt/assemble.ts`
 * `assemblePrompt`.
 *
 * Aynı iki kontrol ORADA da var ama HİÇBİRİ bu yazmayı yakalamaz: akış
 * dosyasının METNİ değişmediği sürece `LiveFlow.refresh()` prompt
 * dosyalarına hiç bakmıyor (bkz. flow/live.ts), `assemblePrompt` ise
 * yalnızca bir ajan GERÇEKTEN çağrılırken diskten okur. Burada kontrol
 * etmeseydik, boş bırakılan bir prompt ancak parası ödenmiş bir
 * aktivasyon çökünce fark edilirdi.
 */
function promptIcerigiSorunu(metin: string): string | null {
  if (metin.trim() === "") {
    return "Prompt dosyası boş olamaz. Sessizce etkisiz kalan bir katman, olmayandan kötüdür.";
  }
  if (metin.includes(LAYER_MARK)) {
    return `Prompt dosyası katman sınırı işareti (${LAYER_MARK}) içeremez — ` +
      "bir katman kendi sınırlarını uyduramaz.";
  }
  return null;
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
 *   GET  /akislar             seçilebilecek akış adları + o an aktif olan
 *   POST /akis/sec            ekranın baktığı akışı değiştirir (atomik)
 *   GET  /promptlar           akışın bildirdiği düzenlenebilir prompt dosyaları
 *   GET  /prompt?yol=...      bir prompt dosyasının metni
 *   POST /prompt/yaz          prompt dosyasını YENİDEN YAZAR
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
    const live = aktif.live;
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

  /**
   * Bu ekranın BAŞLATTIĞI gözcü süreci — yoksa `null`.
   *
   * Yalnızca bunu durduruyoruz (sebebi `/gozcu/durdur` dalında yazılı) ve
   * ekran kapanırken bunu da kapatıyoruz: ekranı kapatıp arkada para
   * harcayan bir süreç bırakmak, "ekrandan yönet" sözünün tersi olurdu.
   */
  /**
   * Ekranın O AN baktığı akış — çalışırken değişebilir.
   *
   * `options.live`/`options.flowPath` artık yalnızca BAŞLANGIÇ değeri;
   * `POST /akis/sec` bunları değiştiriyor. Değişiklik ATOMİK: yeni akış
   * açılamazsa fırlatır ve eskisi aynen durur — `LiveFlow`'un kendi
   * kuralının aynısı, "yarı yüklenmiş akış" diye bir durum yok.
   */
  let aktif: { live: CanliAkis | undefined; flowPath: string | undefined } = {
    live: options.live,
    flowPath: options.flowPath,
  };

  let cocuk: GozcuSurec | null = null;

  /**
   * Gerçek süreç başlatma — gözcünün çıktısı `.skein/gozcu.log`'a gidiyor.
   *
   * Ekranın kendi stdout'una karıştırmak iki akışı birbirine örerdi;
   * dosya hem kalıcı hem de ayrı bir kabukta `tail -f` ile izlenebilir.
   */
  const gercekSpawn = (root: string) => (argv: string[]): GozcuSurec => {
    const [komut, ...args] = argv;
    const child = spawnPortable(komut as string, args, { cwd: root });
    const log = createWriteStream(join(root, ".skein", "gozcu.log"), { flags: "a" });
    child.stdout?.pipe(log);
    child.stderr?.pipe(log);
    return {
      pid: child.pid,
      onExit: (cb) => {
        child.on("exit", cb);
      },
      /**
       * Sinyal SÜREÇ GRUBUNA gidiyor, yalnızca çocuğa değil.
       *
       * Ölçülmüş kusur: `tsx` asıl gözcüyü TORUN süreç olarak koşturuyor
       * (wrapper → gerçek süreç) ve kilidi tutan torun. "Gözcüyü durdur"
       * düğmesi hata vermeden dönüyor, iki süreç de ayakta kalıyor ve
       * ekran "gözcü açık" demeye devam ediyordu — düğme yapmadığı şeyi
       * yapmış gibi görünüyordu. Gerçek tarayıcıda koşturunca çıktı.
       *
       * `spawnPortable` POSIX'te `detached` kuruyor, yani çocuk bir süreç
       * grubu LİDERİ: negatif pid bütün gruba sinyal gönderir. Windows'ta
       * süreç grubu yok, orada çocuğun kendisi kalıyor.
       */
      kill: (signal) => {
        const sig = signal ?? "SIGTERM";
        if (child.pid !== undefined && process.platform !== "win32") {
          try {
            process.kill(-child.pid, sig);
            return;
          } catch {
            // Grup yoksa (çocuk çoktan öldü) tekil sinyale düş.
          }
        }
        child.kill(sig);
      },
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

    if (req.method === "POST" && (path === "/gozcu/baslat" || path === "/gozcu/durdur")) {
      const hata = yetkili(req, token, adlar, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      const ayar = options.gozcu;
      if (ayar === undefined) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({
          hata: "Bu ekran gözcü yönetimine açık değil — ekranı gözcü bayraklarıyla aç.",
        }));
        return;
      }
      const basla = path === "/gozcu/baslat";
      let mesaj: string | null = null;
      (async () => {
        const o = await guncel();
        const kilitYolu = join(o.root, ".skein", "daemon.json");
        const tutan = await liveLock(kilitYolu);

        if (basla) {
          // Kilit TEK yazıcı kuralının kendisi: ikinci gözcü, birincinin
          // elindeki kartı çökmüş sanıp kuyruğa geri atar ve aynı iş ikinci
          // kez, para harcayarak yapılır. Ekran o kuralı atlamıyor.
          if (tutan !== null) {
            throw new QueueError(
              `Zaten bir gözcü açık: pid ${tutan.pid}, akış ${tutan.flow}.`,
            );
          }
          const spawn = ayar.spawn ?? gercekSpawn(o.root);
          // Akış adı EKRANIN o an baktığı akıştan geliyor; bayraklar
          // terminalden. Akış değiştirince düğme doğru akışı koşturuyor.
          const baslayan = spawn([...ayar.komut, o.flowName, "--serve", ...ayar.bayraklar]);
          cocuk = baslayan;
          // Referans, süreç GERÇEKTEN bitince bırakılıyor — "durdur"
          // dediğimizde değil. İkisi aynı an değil.
          baslayan.onExit(() => {
            if (cocuk === baslayan) cocuk = null;
          });
        } else {
          // YALNIZCA kendi başlattığımızı durduruyoruz.
          //
          // Kilitteki pid'e sinyal göndermek kolay olurdu ama tehlikeli:
          // "canlı" olmak "bizim gözcümüz olmak" demek değil — bayat bir
          // kilitte pid geri dönüşmüş, ilgisiz bir sürece ait olabilir. O
          // süreci öldürmek, ekranın yapabileceği en kötü şey olurdu.
          if (cocuk === null) {
            throw new QueueError(
              tutan === null
                ? "Durdurulacak gözcü yok."
                : `Bu gözcüyü bu ekran başlatmadı (pid ${tutan.pid}); ` +
                  `onu başlattığın kabukta Ctrl-C ile durdur.`,
            );
          }
          // Referans BIRAKILMIYOR: gözcü sinyali alınca süren turu
          // bitirip çıkıyor ve o ana kadar hâlâ bizim sürecimiz. Eskiden
          // burada `cocuk = null` vardı ve ikinci basış "bu gözcüyü bu
          // ekran başlatmadı" diyordu — ekran kendi başlattığı süreci
          // unutuyordu. Çekirdek ikinci sinyali "hemen çık" sayıyor, yani
          // ikinci basışın ÇALIŞMASI gerekiyor.
          cocuk.kill("SIGTERM");
          mesaj = "Durdurma sinyali gönderildi — gözcü KOŞAN TURU bitirip " +
            "çıkacak. Yarıda kesmek, parası ödenmiş bir turu çöpe atardı. " +
            "Tekrar basmak hemen durdurur.";
        }
        // Model kilitten okunuyor; gözcünün gerçekten açıldığını dosya
        // söylüyor, bizim iddiamız değil.
        return buildModel(await guncel());
      })()
        .then((model) => {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ model, ...(mesaj === null ? {} : { mesaj }) }));
        })
        .catch((error: unknown) => {
          const kod = error instanceof QueueError ? 409 : 400;
          res.writeHead(kod, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        });
      return;
    }

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
      const flowPath = aktif.flowPath;
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

    if (req.method === "POST" && path === "/akis/sec") {
      const hata = yetkili(req, token, adlar, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      const ayar = options.akisSecimi;
      if (ayar === undefined) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata: "Bu ekran akış seçimine açık değil." }));
        return;
      }
      readBody(req)
        .then(async (body) => {
          const istek = JSON.parse(body === "" ? "{}" : body) as { ad?: unknown };
          const ad = typeof istek.ad === "string" ? istek.ad : "";
          // AD DOĞRUDAN YOLA ÇEVRİLMİYOR. `../` içeren bir ad "dizgi
          // temizleyerek" reddedilseydi, temizleme kuralı bir gün eksik
          // kalırdı — ÜYELİK asla eksik kalmaz: listede yoksa ad, hangi
          // şekilde yazılmış olursa olsun, burada reddedilir.
          const akislar = await ayar.listele();
          if (!akislar.includes(ad)) {
            throw new Error(`Bilinmeyen akış: ${ad}`);
          }
          // `ac` BAŞARISIZSA FIRLATIR (bozuk YAML, kural ihlali) ve
          // `aktif` yalnızca BAŞARIDAN SONRA değişiyor — "yarı yüklenmiş
          // akış" diye bir durum yok, `LiveFlow`'un kendi kuralının aynısı.
          const { live, flowPath } = await ayar.ac(ad);
          aktif = { live, flowPath };
          const model = await buildModel(await guncel());
          return model;
        })
        .then((model) => {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ model }));
        })
        .catch((error: unknown) => {
          const kod = error instanceof QueueError ? 409 : 400;
          res.writeHead(kod, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        });
      return;
    }

    if (req.method === "POST" && path === "/prompt/yaz") {
      const hata = yetkili(req, token, adlar, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      // Aynı kapı akış düzenlemeyle: `flowPath`/`loadOptions` verilmediyse
      // bu ekranın yetkisi yoktur — "ekranın yetkisi, onu açan komutun
      // verdiği kadar" kuralının aynısı, rol promptları için de geçerli.
      const flowPath = aktif.flowPath;
      const loadOptions = options.loadOptions;
      if (flowPath === undefined || loadOptions === undefined) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata: "Bu ekran prompt düzenlemeye açık değil." }));
        return;
      }
      readBody(req)
        .then(async (body) => {
          const istek = JSON.parse(body === "" ? "{}" : body) as { yol?: unknown; metin?: unknown };
          const yol = typeof istek.yol === "string" ? istek.yol : "";
          const metin = typeof istek.metin === "string" ? istek.metin : "";

          const o = await guncel();
          // ÜYELİK: yol, akışın bildirdiği listede AYNEN var mı. `../` ya da
          // mutlak yol, şekli ne olursa olsun, listede olmadığı için burada
          // aynen reddedilir — dizgi temizlenerek değil.
          const liste = promptListesi(o.topology);
          if (!liste.some((p) => p.yol === yol)) {
            throw new Error(`Bilinmeyen prompt yolu: ${yol}`);
          }
          const sorun = promptIcerigiSorunu(metin);
          if (sorun !== null) throw new Error(sorun);

          await writeFile(join(o.root, yol), metin, "utf8");

          // Topoloji HASH'İ prompt İÇERİĞİNİ KAPSAMIYOR (flow/load.ts,
          // topologyHash) ve bu KASITLI — bu yazma onu bozmuyor, kapsamaya
          // da başlatmıyor. Model yine de tazeleniyor: akış dosyası arada
          // elle değişmiş olabilir.
          return buildModel(await guncel());
        })
        .then((model) => {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ model }));
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

    if (path === "/akislar") {
      // OKUMA UCU: `akisSecimi` verilmemişse 404 değil boş liste — ekran
      // seçiciyi bu uca bakarak ÇİZEBİLMELİ, uç yoksa seçici hiç çıkmaz.
      const ayar = options.akisSecimi;
      const listele = ayar === undefined ? Promise.resolve<string[]>([]) : ayar.listele();
      Promise.all([listele, guncel()]).then(
        ([akislar, o]) => {
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify({ akislar, aktif: o.flowName }));
        },
        (error: unknown) => {
          res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        },
      );
      return;
    }

    if (path === "/promptlar") {
      // OKUMA UCU, gözcü/kart uçları gibi jetonsuz: liste TOPOLOJİDEN
      // türüyor, yazma yetkisine bağlı değil — ekran salt okunur açılsa
      // bile hangi dosyaların akışa ait olduğu görülebilir olmalı.
      guncel().then(
        (o) => {
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify({ promptlar: promptListesi(o.topology) }));
        },
        (error: unknown) => {
          res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        },
      );
      return;
    }

    if (path === "/prompt") {
      const yol = queryParam(req, "yol");
      guncel()
        .then(async (o) => {
          // ÜYELİK — `/prompt/yaz` ile aynı kapı: yol listede AYNEN var mı.
          const liste = promptListesi(o.topology);
          if (!liste.some((p) => p.yol === yol)) {
            throw new Error(`Bilinmeyen prompt yolu: ${yol}`);
          }
          return readFile(join(o.root, yol), "utf8");
        })
        .then(
          (metin) => {
            res.writeHead(200, {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            });
            res.end(JSON.stringify({ metin }));
          },
          (error: unknown) => {
            res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ hata: (error as Error).message }));
          },
        );
      return;
    }

    if (path === "/akis") {
      // Düzenleyicinin başlangıç hâli: yaşayan akışın taslak karşılığı.
      guncel().then(
        async (o) => {
          // Taslak yaşayan AKIŞTAN kuruluyor, dondurulmuş topolojiden değil:
          // kapı mesajları ve yol biçimi yalnızca akışta tam.
          const draft = aktif.flowPath === undefined || aktif.live === undefined
            ? null
            : fromFlow(aktif.live.flow);
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
        // Ekran kapanırken KENDİ başlattığı gözcüyü de kapatıyor. Aksi
        // hâlde Ctrl-C'den sonra arkada para harcayan bir süreç kalırdı ve
        // kilidi tuttuğu için bir sonraki gözcü de açılamazdı.
        cocuk?.kill("SIGTERM");
        cocuk = null;
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}
