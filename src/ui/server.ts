import { dirname, join, relative, sep } from "node:path";
import { knownProviderSet } from "../adapters/factory.js";
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createWriteStream } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { newCard } from "../card/card.js";
import { QueueError, type ReleaseDecision } from "../card/queue.js";
import { checkDraft, fromFlow, writeDraft, type DraftRole, type FlowDraft } from "../flow/draft.js";
import { loadFlow, type Flow, type LoadOptions } from "../flow/load.js";
import { closeOrphan } from "../card/orphan.js";
import { releaseCard } from "../card/release.js";
import { LAYER_MARK } from "../prompt/assemble.js";
import { spawnPortable } from "../proc/process.js";
import { liveLock } from "../watch/lock.js";
import { snapshot, type TopologySnapshot } from "../flow/snapshot.js";
import { buildDetail, buildModel, buildSteps, type DetailOptions, type UiModel } from "./model.js";
import { renderPage } from "./page.js";
import { sonTemaOku, sonTemaYaz, type Tema } from "./port-memory.js";

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
  flowChoice?: {
    /** Seçilebilecek akış adları. */
    list: () => Promise<string[]>;
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
  watcher?: {
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
  const items: { etiket: string; yol: string }[] = [];
  topology.constitution.forEach((yol, i) => items.push({ etiket: `anayasa:${i + 1}`, yol }));
  topology.roles.forEach((rol) => items.push({ etiket: `rol:${rol.id}`, yol: rol.prompt }));
  return items;
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
 * Yeni rol için ŞABLON prompt metni — `POST /rol/yeni` gövdesi `prompt`
 * VERMEDİĞİNDE yazılan budur.
 *
 * BOŞ OLAMAZ: kural 9 boş bir prompt dosyasını reddediyor (bkz.
 * `checkPromptFile`, flow/load.ts), yani boş bir şablon bu ucu kendi
 * kendine kilitlerdi — "sessizce etkisiz kalan bir katman, olmayandan
 * kötüdür" kuralının aynısı burada da geçerli. Üç başlık rolün SORUMLULUĞUNU
 * SORUYOR; operatör doldurmasa da akış geçerli kalır, ama ne doldurması
 * gerektiği açık.
 */
function rolPromptSablonu(id: string): string {
  return `# Rolün: ${id}\n\n` +
    `## Sahiplendiğin\n\n- (bu rol hangi davranışı/işi üstleniyor?)\n\n` +
    `## Nasıl çalışırsın\n\n- (bu rol işini nasıl yapıyor, hangi sırayla?)\n\n` +
    `## Sahiplenmediğin\n\n- (bu rolün kapsamı dışında kalan ve başka bir role bırakılan şey?)\n`;
}

/**
 * Bir akışın ÖZETİ — Akışlar sekmesinin kart ızgarası için (DEVIR.md §4,
 * kart c-20261105-d36e37: her kartta açıklama, rol sayısı ve "planner →
 * … → bitti" zinciri).
 *
 * SALT OKUNUR ve yazma yetkisinden BAĞIMSIZ: ekran salt okunur açılmış
 * olsa bile (ne `flowPath` ne `loadOptions` verilmiş) liste yine akışların
 * GERÇEK dosyalarından türüyor — görüntülemek düzenlemekten ayrı bir
 * yetki, `diyagramSvgKur`/`akisAc`'ın editable ayrımıyla AYNI ilke. Bu
 * yüzden `loadOptions` yoksa burada kendi (aynı türde) varsayılanı
 * kuruluyor, `/kart/.../kapat`ın `closeOrphan` çağrısındaki desenin aynısı.
 *
 * Akış BOZUKSA (geçersiz YAML, kural ihlali) PATLAMIYOR — `hata` alanıyla
 * dönüyor: bir akışın bozulması listenin GERİ KALANINI göstermeyi
 * engellememeli, `m.bozuk`/`m.engeller`in "izole et ama SAKLAMA" ilkesinin
 * aynısı burada da geçerli.
 */
async function akisOzetiYukle(
  root: string, ad: string, loadOptions: LoadOptions | undefined,
): Promise<{ ad: string; draft: FlowDraft | null; hata?: string }> {
  const secenekler = loadOptions ?? { root, providers: knownProviderSet() };
  try {
    const flow = await loadFlow(join(root, "hub", "flows", `${ad}.yaml`), secenekler);
    return { ad, draft: fromFlow(flow) };
  } catch (error) {
    return { ad, draft: null, hata: (error as Error).message };
  }
}

/**
 * `POST /akis/onizleme` ve `POST /akis/yaz`ın YAZDIĞI/DOĞRULADIĞI yol.
 *
 * `yeniAd` YOKSA davranış ESKİSİYLE AYNEN: ekranın O AN baktığı akışın
 * yolu (`aktifYol`) — bu dal mevcut hiçbir sınamayı DEĞİŞTİRMEZ.
 *
 * `yeniAd` VARSA — DEVIR.md §4'ün "Yeni akış" iletişim kutusu ve kart
 * ızgarasındaki "Kopyala" düğmesinin ihtiyacı: YENİ bir dosyaya yazmak.
 * Bu, ARCHITECTURE.md'nin "yazma tek yoldan" kısıtını (bkz. bu dosyadaki
 * "diyagramdan rol çıkarma" describe'ının yorumu) ikinci bir uç AÇARAK
 * değil, AYNI /akis/yaz + /akis/onizleme çiftini genişleterek koruyor —
 * DEVIR.md'nin kendi notu da bu üçünü "zaten var" sayıyor.
 *
 * Güvenlik ÜYELİKLE: `yeniAd` önce karakter kümesine (DEVIR.md §3: yalnız
 * `a-z0-9-`, akış düzenleyicideki rol adı kısıtının AYNISI), sonra
 * BENZERSİZLİĞE (akış seçiminin listesinde AYNEN yok mu) karşı
 * doğrulanıyor — `/akis/sec`in "ad listede var mı" kuralının simetriği:
 * orada "varsa kabul", burada "varsa reddet" (benzersizlik), ikisi de
 * dizgi temizlemiyor, üyelikle karar veriyor.
 */
async function hedefAkisYolu(
  newName: string | undefined, aktifYol: string, options: ServeUiOptions,
): Promise<string> {
  if (newName === undefined) return aktifYol;
  if (!/^[a-z0-9-]+$/.test(newName)) {
    throw new Error("Akış adı yalnızca a-z0-9- içerebilir.");
  }
  const ayar = options.flowChoice;
  if (ayar === undefined) {
    throw new Error("Bu ekran yeni akış oluşturmaya açık değil.");
  }
  const mevcutAdlar = await ayar.list();
  if (mevcutAdlar.includes(newName)) {
    throw new Error(`Bu ad zaten kullanılıyor: ${newName}`);
  }
  return join(options.root, "hub", "flows", `${newName}.yaml`);
}

/**
 * `abs` yolunu `flowDir`e göre göreli, POSIX ayracıyla yazar.
 *
 * `flow/draft.ts`'teki `fromFlow`'un özel (dışa açılmamış) `goreli`
 * yardımcısının BİREBİR AYNISI — akış dosyasının taslak karşılığı hep bu
 * biçimi bekliyor (`./` ile başlamayan bir yol YAML'da farklı yorumlanırdı).
 * `flow/draft.ts`e taşınıp dışa açılmadı: tek kullanıcısı burası, ikinci bir
 * yer açılırsa o zaman paylaşılan bir yere taşınır.
 */
function goreliYol(flowDir: string, abs: string): string {
  const r = relative(flowDir, abs).split(sep).join("/");
  return r.startsWith(".") ? r : `./${r}`;
}

/** Gözcü günlüğünün ekrana giden hâli — `GET /gozcu/log` (kart c-20261105-92d731). */
export interface GozcuLogSatiri {
  at: string;
  mesaj: string;
  /** DEVIR.md §2: "hatalar accent-700" — kaynak STDERR'se true (bkz. satirYaziciKur). */
  hata: boolean;
}

/**
 * Tek bir gözcü.log satırını ayrıştırır — SAF.
 *
 * Satırlar `satirYaziciKur` tarafından `"HH:MM mesaj"` biçiminde yazılıyor
 * (stderr kaynaklılar zaten "✗ " ile başlıyor). Biçime UYMAYAN bir satır
 * (eski/elle eklenmiş içerik) SESSİZCE ATILMIYOR — saati boş, mesajı
 * ham satırın kendisi olarak gösteriliyor: BİLDİRİLMEYEN SIFIR DEĞİLDİR,
 * ayrıştıramadığımız bir satırı gizlemek de aynı kusur sınıfı.
 */
export function gozcuLogSatiriAyristir(ham: string): GozcuLogSatiri {
  const match = /^(\d{2}:\d{2}) (.*)$/.exec(ham);
  const mesaj = match ? (match[2] ?? "") : ham;
  return { at: match ? (match[1] ?? "") : "", mesaj, hata: mesaj.startsWith("✗") };
}

/**
 * `.skein/gozcu.log`'un son `n` satırı, ayrıştırılmış — en eskisi önce
 * (DEVIR.md'nin tablosu zaman sırasıyla okunuyor, en yeni günlük ÇIKIŞI
 * gibi en ALTTA).
 *
 * Dosya yoksa (gözcü bu ekrandan HİÇ açılmamış) BOŞ liste — bu bir okuma
 * hatası değil, "henüz günlük yok" demek.
 */
export async function gozcuLogKuyruk(path: string, n = 20): Promise<GozcuLogSatiri[]> {
  let metin: string;
  try {
    metin = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const lines = metin.split("\n").filter((s) => s !== "");
  return lines.slice(-n).map(gozcuLogSatiriAyristir);
}

/**
 * Bir alt sürecin stdout/stderr'ini SAAT DAMGALI satırlara bölüp log
 * akışına yazan bir `data` dinleyicisi üretir (kart c-20261105-92d731).
 *
 * SATIR TAMAMLANMADAN yazılmıyor: `"\n"`e kadar arabelleğe alınıyor, yoksa
 * tek bir `console.log` birden çok `data` olayına bölünürse ("büyük" bir
 * satır) ortasına saat damgası ve/veya "✗ " sıkışırdı. Son parça (satır
 * sonu olmayan kalıntı) süreç çıkarken KASITLI OLARAK atılıyor — pratikte
 * her `console.log`/`console.error` kendi `\n`'ini taşıyor, ve bu dosyanın
 * tek tüketicisi (tail) zaten tamamlanmamış bir satırı gösteremez.
 */
export function satirYaziciKur(log: NodeJS.WritableStream, hataKaynagi: boolean): (chunk: Buffer) => void {
  let kalan = "";
  return (chunk: Buffer) => {
    kalan += chunk.toString("utf8");
    const parcalar = kalan.split("\n");
    kalan = parcalar.pop() ?? "";
    for (const satir of parcalar) {
      const saat = new Date().toTimeString().slice(0, 5);
      const gosterim = hataKaynagi && !satir.startsWith("✗") ? `✗ ${satir}` : satir;
      log.write(`${saat} ${gosterim}\n`);
    }
  };
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
  raw: string | undefined, names: Set<string>, port: number,
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
  return names.has(url.hostname);
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
function bizeMiGeldi(req: IncomingMessage, names: Set<string>, port: number): boolean {
  return bizeAit(req.headers["host"], names, port);
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
  req: IncomingMessage, token: string, names: Set<string>, port: number,
): string | null {
  if (req.headers["x-skein-token"] !== token) return "jeton yok ya da yanlış";
  const origin = req.headers["origin"];
  if (typeof origin === "string" && !bizeAit(origin, names, port)) {
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
 *   POST /rol/yeni            YENİ bir rolü promptuyla BİRLİKTE, ATOMİK ekler
 *   GET  /adimlar?kart=...    kartın güncel aktivasyonunun TAM adım izi
 *                             (DEVIR.md §6, Ajanlar sekmesi — GERÇEKTEN
 *                             yeni uç, bkz. tasarim/SAPMALAR.md §3)
 *   POST /tema                üst çubuktaki tema anahtarının seçimini
 *                             `.skein/ekran.json`'a kalıcı yazar (kart
 *                             c-20261106-e62847)
 *
 * Yazan uç noktalar KOMUT gönderiyor: yüzey kendi kopyasını
 * güncellemiyor, `queue.release()` çağırıyor ve cevabı çekirdeğin ürettiği
 * yeni durumdan okuyor (ARCHITECTURE, değişmez 1). Çekirdek reddederse
 * (kaçış kapısından ileri bırakma) mesaj kullanıcıya aynen gider.
 */
export async function serveUi(options: ServeUiOptions): Promise<UiServer> {
  const host = options.host ?? "127.0.0.1";
  const token = options.token ?? randomBytes(24).toString("hex");
  const names = izinliAdlar(host);
  // Port `listen`den SONRA biliniyor (0 = boş port seç), ama istek
  // işleyicisi ondan önce kuruluyor. Kapanış üzerinden okumak, portu iki
  // yerde tutmaktan iyi: bu projede aynı bilginin iki kopyası üç kez kusur
  // doğurdu.
  let dinlenenPort = 0;
  const portu = (): number => dinlenenPort;

  /** Yaşayan akış varsa yoklar ve o anki topolojiyle seçenekleri kurar. */
  const current = async (): Promise<ServeUiOptions> => {
    const live = active.live;
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
  let active: { live: CanliAkis | undefined; flowPath: string | undefined } = {
    live: options.live,
    flowPath: options.flowPath,
  };

  let cocuk: GozcuSurec | null = null;

  /**
   * Gerçek süreç başlatma — gözcünün çıktısı `.skein/gozcu.log`'a gidiyor.
   *
   * Ekranın kendi stdout'una karıştırmak iki akışı birbirine örerdi;
   * dosya hem kalıcı hem de ayrı bir kabukta `tail -f` ile izlenebilir.
   *
   * Satırlar artık SAAT DAMGALI yazılıyor (kart c-20261105-92d731, DEVIR.md
   * §2 "son satırlar: saat + mesaj"): gözcünün KENDİ `console.log`'u saat
   * basmıyor, bu yüzden damga BURADA, yazma anında ekleniyor — ikinci bir
   * kaynak (gözcüyü değiştirmek) açmadan. Kaynak STDERR'den gelen her satır
   * "✗ " ile işaretleniyor (zaten öyle başlamıyorsa) — `/gozcu/log`
   * (gozcuLogKuyruk) bunu "hata" sayıp accent-700 gösterir.
   */
  const gercekSpawn = (root: string) => (argv: string[]): GozcuSurec => {
    const [komut, ...args] = argv;
    const child = spawnPortable(komut as string, args, { cwd: root });
    const log = createWriteStream(join(root, ".skein", "gozcu.log"), { flags: "a" });
    child.stdout?.on("data", satirYaziciKur(log, false));
    child.stderr?.on("data", satirYaziciKur(log, true));
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
    if (!bizeMiGeldi(req, names, portu())) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("beklenmeyen ana bilgisayar adı\n");
      return;
    }

    const path = (req.url ?? "/").split("?")[0];

    const birak = path === undefined ? null : /^\/kart\/([^/]+)\/birak$/.exec(path);
    const kapat = path === undefined ? null : /^\/kart\/([^/]+)\/kapat$/.exec(path);

    if (req.method === "POST" && (path === "/gozcu/baslat" || path === "/gozcu/durdur")) {
      const hata = yetkili(req, token, names, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      const ayar = options.watcher;
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
        const o = await current();
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
        return buildModel(await current());
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
      const hata = yetkili(req, token, names, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      readBody(req)
        .then(async (body) => {
          const request = JSON.parse(body === "" ? "{}" : body) as Record<string, unknown>;
          // Boşluk denetimi BURADA YOK ve bu bilinçli: `newCard` zaten
          // reddediyor ve mesajı daha iyi ("role verilecek iş bu"). Buraya
          // ikinci bir kontrol yazmıştım; mutasyon sınaması onun hiçbir şeyi
          // değiştirmediğini gösterdi — aynı kural iki yerde, bu deponun en
          // sık tekrarlayan kusur sınıfı. Çekirdeğin hatası 400 ile aynen
          // kullanıcıya gidiyor.
          const baslik = typeof request["baslik"] === "string" ? request["baslik"] : "";
          const gorev = typeof request["gorev"] === "string" ? request["gorev"] : "";

          // Topoloji YAŞAYAN dosyadan: kart açılırken donan hash budur.
          const o = await current();

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
      const hata = yetkili(req, token, names, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      const flowPath = active.flowPath;
      const loadOptions = options.loadOptions;
      if (flowPath === undefined || loadOptions === undefined) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata: "Bu ekran akış düzenlemeye açık değil." }));
        return;
      }
      const yaz = path === "/akis/yaz";
      readBody(req)
        .then(async (body) => {
          // `yeniAd`: DEVIR.md §4'ün "Yeni akış" iletişim kutusu ve
          // "Kopyala" düğmesi — FlowDraft'ın MODELLEDİĞİ bir alan değil
          // (bkz. draftAlanlari, flow/draft.ts), yalnızca BU isteğin hedef
          // dosyasını seçiyor. `govde`nin tipi `FlowDraft`in bir ÜST KÜMESİ
          // (yeniAd ek alanıyla), yani checkDraft/writeDraft'a AYRI bir
          // `as FlowDraft` dökümü GEREKMEDEN geçebiliyor (intersection zaten
          // uyumlu) — fazladan `yeniAd` anahtarı orada görmezden gelinir
          // (draftAlanlari kendi beyaz listesini okur, zararsız).
          const govde = JSON.parse(body === "" ? "{}" : body) as FlowDraft & { newName?: unknown };
          const newName = typeof govde.newName === "string" ? govde.newName : undefined;
          const hedefYol = await hedefAkisYolu(newName, flowPath, options);
          // Önizleme YAZMAZ: ekranda denenen her taslak diske düşseydi gözcü
          // yarım taslakları okurdu. `yeniAd`'lı önizleme de aynı kuralı
          // taşıyor — benzersizlik/karakter kümesi hatası burada da ERKEN
          // yakalanır, ama dosyaya hiçbir koşulda dokunulmaz.
          if (!yaz) {
            const sonuc = await checkDraft(hedefYol, govde, loadOptions);
            res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify(sonuc));
            return;
          }
          const sonuc = await writeDraft(hedefYol, govde, loadOptions);
          if (!sonuc.ok) {
            res.writeHead(409, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ hata: sonuc.message }));
            return;
          }
          // Yazdıktan sonra model YENİDEN kuruluyor: yeni topoloji zaten
          // `live.refresh()` ile okunacak, ekran onu çizsin. `yeniAd`'lı bir
          // yazmada bu BİLEREK hâlâ ESKİ aktif akışın modeli: akış seçimi
          // AYRI ve AÇIK bir eylem (`/akis/sec`), bir dosya yazmak kendi
          // başına "şuna geç" demez — istemci yeni akışı açmak istiyorsa
          // bunu ayrıca ister.
          const model = await buildModel(await current());
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
      const hata = yetkili(req, token, names, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      const ayar = options.flowChoice;
      if (ayar === undefined) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata: "Bu ekran akış seçimine açık değil." }));
        return;
      }
      readBody(req)
        .then(async (body) => {
          const request = JSON.parse(body === "" ? "{}" : body) as { ad?: unknown };
          const ad = typeof request.ad === "string" ? request.ad : "";
          // AD DOĞRUDAN YOLA ÇEVRİLMİYOR. `../` içeren bir ad "dizgi
          // temizleyerek" reddedilseydi, temizleme kuralı bir gün eksik
          // kalırdı — ÜYELİK asla eksik kalmaz: listede yoksa ad, hangi
          // şekilde yazılmış olursa olsun, burada reddedilir.
          const flows = await ayar.list();
          if (!flows.includes(ad)) {
            throw new Error(`Bilinmeyen akış: ${ad}`);
          }
          // `ac` BAŞARISIZSA FIRLATIR (bozuk YAML, kural ihlali) ve
          // `aktif` yalnızca BAŞARIDAN SONRA değişiyor — "yarı yüklenmiş
          // akış" diye bir durum yok, `LiveFlow`'un kendi kuralının aynısı.
          const { live, flowPath } = await ayar.ac(ad);
          active = { live, flowPath };
          const model = await buildModel(await current());
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
      const hata = yetkili(req, token, names, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      // Aynı kapı akış düzenlemeyle: `flowPath`/`loadOptions` verilmediyse
      // bu ekranın yetkisi yoktur — "ekranın yetkisi, onu açan komutun
      // verdiği kadar" kuralının aynısı, rol promptları için de geçerli.
      const flowPath = active.flowPath;
      const loadOptions = options.loadOptions;
      if (flowPath === undefined || loadOptions === undefined) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata: "Bu ekran prompt düzenlemeye açık değil." }));
        return;
      }
      readBody(req)
        .then(async (body) => {
          const request = JSON.parse(body === "" ? "{}" : body) as { yol?: unknown; metin?: unknown };
          const yol = typeof request.yol === "string" ? request.yol : "";
          const metin = typeof request.metin === "string" ? request.metin : "";

          const o = await current();
          // ÜYELİK: yol, akışın bildirdiği listede AYNEN var mı. `../` ya da
          // mutlak yol, şekli ne olursa olsun, listede olmadığı için burada
          // aynen reddedilir — dizgi temizlenerek değil.
          const items = promptListesi(o.topology);
          if (!items.some((p) => p.yol === yol)) {
            throw new Error(`Bilinmeyen prompt yolu: ${yol}`);
          }
          const sorun = promptIcerigiSorunu(metin);
          if (sorun !== null) throw new Error(sorun);

          await writeFile(join(o.root, yol), metin, "utf8");

          // Topoloji HASH'İ prompt İÇERİĞİNİ KAPSAMIYOR (flow/load.ts,
          // topologyHash) ve bu KASITLI — bu yazma onu bozmuyor, kapsamaya
          // da başlatmıyor. Model yine de tazeleniyor: akış dosyası arada
          // elle değişmiş olabilir.
          return buildModel(await current());
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

    /**
     * YENİ ROL + PROMPTU, ATOMİK.
     *
     * Kilitlenme şuydu: kural 9 (`flow/load.ts`, `checkPromptFile`) rolün
     * prompt dosyasının VAR ve DOLU olmasını şart koşuyor, yani akışa yeni
     * rolü eklemeden prompt dosyasını yazamıyorsun (akış geçersiz kalıyor,
     * `/akis/yaz` reddediyor) — ama `/prompt/yaz`ın YOL BEYAZ LİSTESİ
     * topolojiden türüyor, yani dosya akışta olmadan `/prompt/yaz` da onu
     * yazdırmıyor. Rolü dosyasız ekleyemiyorsun, dosyayı rolsüz
     * yaratamıyorsun.
     *
     * Çözüm İKİSİNİ TEK İŞLEMDE yapmak: önce prompt dosyasını (gövdede
     * verilmediyse şablondan) yaz, sonra yeni rolü taslağa ekleyip
     * `writeDraft` ile doğrula. Doğrulama BAŞARISIZSA (`!sonuc.ok`) prompt
     * dosyası da GERİ ALINIYOR — `LiveFlow`'un kendi kuralının aynısı
     * (flow/live.ts, "yarı yüklenmiş akış diye bir durum yok"): yarı
     * yaratılmış bir rol, dosyası var ama akışta yok ya da tersi, depoyu
     * operatörün elle temizlemesi gereken bir hâle sokardı.
     */
    if (req.method === "POST" && path === "/rol/yeni") {
      const hata = yetkili(req, token, names, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      // Aynı kapı akış/prompt düzenlemeyle: "ekranın yetkisi, onu açan
      // komutun verdiği kadar" kuralının aynısı.
      const flowPath = active.flowPath;
      const loadOptions = options.loadOptions;
      const canliAkis = active.live;
      if (flowPath === undefined || loadOptions === undefined || canliAkis === undefined) {
        res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata: "Bu ekran rol eklemeye açık değil." }));
        return;
      }
      readBody(req)
        .then(async (body) => {
          const request = JSON.parse(body === "" ? "{}" : body) as Record<string, unknown>;
          const id = typeof request["id"] === "string" ? request["id"].trim() : "";
          const provider = typeof request["provider"] === "string" ? request["provider"] : "";
          const workspace = typeof request["workspace"] === "string" ? request["workspace"] : "";
          // ÇAĞIRAN nereye ekleneceğini söylüyor — uç bunu KENDİ KAFASINA
          // GÖRE TAHMİN ETMİYOR. `sonra`, yeni rolün hangi rolün ARDINA
          // gireceği: o rolün `next`i yeni role, yeni rolünki eskisine
          // bağlanıyor (yeniden kablolama).
          const sonra = typeof request["sonra"] === "string" ? request["sonra"] : "";
          const receiveRaw = request["receive"];
          const receive = typeof receiveRaw === "string" && receiveRaw !== "" ? receiveRaw : undefined;
          const rejectRaw = request["reject"];
          const reject = typeof rejectRaw === "string" && rejectRaw !== "" ? rejectRaw : undefined;
          const promptRaw = request["prompt"];
          // Gövdede `prompt` VERİLMEDİYSE şablondan yazılıyor — BOŞ değil,
          // çünkü boş dosya kural 9'a takılır (bkz. yukarıdaki yorum).
          const promptMetni = typeof promptRaw === "string" && promptRaw.trim() !== ""
            ? promptRaw
            : rolPromptSablonu(id || "yeni-rol");

          if (id === "") throw new Error("`id` boş olamaz.");
          if (sonra === "") {
            throw new Error(
              "`sonra` boş olamaz — yeni rolün hangi rolün ARDINA ekleneceği belirtilmeli.",
            );
          }

          await current(); // akışı yokla — en güncel `canliAkis.flow` üstünden çalışıyoruz.
          const taslak = fromFlow(canliAkis.flow);

          // AYNI ID REDDEDİLİR — ve DOSYA YAZILMADAN: bu denetim her türlü
          // dosya yazmadan ÖNCE.
          if (taslak.roles.some((r) => r.id === id)) {
            throw new Error(`Rol zaten var: ${id}`);
          }
          const sonraIdx = taslak.roles.findIndex((r) => r.id === sonra);
          if (sonraIdx === -1) {
            throw new Error(`Bilinmeyen rol: ${sonra}`);
          }

          // Yeni rolün prompt dosyası, `sonra`nın promptuyla AYNI dizinde —
          // akışların bugünkü kuralı (bütün rol promptları aynı dizinde)
          // bu akışta da geçerli kalıyor, uç bunu uydurmuyor.
          const sonraRolTam = canliAkis.flow.roles.find((r) => r.id === sonra);
          if (sonraRolTam === undefined) {
            throw new Error(`Bilinmeyen rol: ${sonra}`);
          }
          const promptAbs = join(dirname(sonraRolTam.promptPath), `${id}.md`);
          const promptGoreli = goreliYol(dirname(flowPath), promptAbs);

          const sorun = promptIcerigiSorunu(promptMetni);
          if (sorun !== null) throw new Error(sorun);

          // ATOMİKLİK, adım 1: prompt dosyasını YAZ. Eski içerik (varsa)
          // GERİ ALMA için saklanıyor — bu yol normalde yeni bir dosya ama
          // aynı ada rastlayan yetim bir dosya varsa onu da korumalıyız.
          const eskiMetin = await readFile(promptAbs, "utf8").catch(() => undefined);
          await writeFile(promptAbs, promptMetni, "utf8");

          const yeniRol: DraftRole = {
            id, provider, workspace, prompt: promptGoreli,
            next: (taslak.roles[sonraIdx] as DraftRole).next,
            ...(receive === undefined ? {} : { receive }),
            ...(reject === undefined ? {} : { reject }),
          };
          const yeniRoller = taslak.roles.map((r, i) =>
            i === sonraIdx ? { ...r, next: id } : r);
          yeniRoller.splice(sonraIdx + 1, 0, yeniRol);
          const yeniTaslak: FlowDraft = { ...taslak, roles: yeniRoller };

          // ATOMİKLİK, adım 2: akışı DOĞRULA ve YAZ.
          const sonuc = await writeDraft(flowPath, yeniTaslak, loadOptions);
          if (!sonuc.ok) {
            // DOĞRULAMA BAŞARISIZ — adım 1 GERİ ALINIYOR: yarı yaratılmış
            // bir rol (dosyası var, akışta yok) bırakmıyoruz.
            if (eskiMetin === undefined) await unlink(promptAbs).catch(() => {});
            else await writeFile(promptAbs, eskiMetin, "utf8");
            return { kod: 409 as const, hata: sonuc.message };
          }
          const model = await buildModel(await current());
          return { kod: 200 as const, model };
        })
        .then((sonuc) => {
          res.writeHead(sonuc.kod, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify(
            sonuc.kod === 200 ? { model: sonuc.model } : { hata: sonuc.hata },
          ));
        })
        .catch((error: unknown) => {
          res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        });
      return;
    }

    if (req.method === "POST" && kapat !== null) {
      const hata = yetkili(req, token, names, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      const id = decodeURIComponent(kapat[1] as string);
      current()
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
      const hata = yetkili(req, token, names, portu());
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
          const model = await buildModel(await current());
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

    if (req.method === "POST" && path === "/tema") {
      const hata = yetkili(req, token, names, portu());
      if (hata !== null) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata }));
        return;
      }
      readBody(req)
        .then(async (body) => {
          const request = JSON.parse(body === "" ? "{}" : body) as { tema?: unknown };
          const tema = request.tema;
          // ÜYELİK: üç değerden biri DEĞİLSE reddedilir — bir yazım hatası
          // (ör. "açık" İ'siz yazılmamış "acik" DEĞİL) sessizce "sistem"e
          // düşürülmez, istemciye AÇIKÇA hata döner. `sonTemaOku`'nun
          // "bozuk kayıt kilitlemez" kuralı OKUMA için; bu BİR YAZMA, ve
          // yazan taraf (bu ekranın kendi JS'i) her zaman geçerli bir
          // değer gönderecek — geçersizse BİR KUSUR var, örtülmemeli.
          if (tema !== "sistem" && tema !== "acik" && tema !== "koyu") {
            throw new Error("Geçersiz tema: " + JSON.stringify(tema));
          }
          await sonTemaYaz(options.root, tema as Tema);
        })
        .then(() => {
          res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ ok: true }));
        })
        .catch((error: unknown) => {
          res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
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
      const ayar = options.flowChoice;
      const list = ayar === undefined ? Promise.resolve<string[]>([]) : ayar.list();
      Promise.all([list, current()])
        .then(async ([flows, o]) => {
          // `ozet`: Akışlar sekmesinin kart ızgarası (DEVIR.md §4) için —
          // bkz. `akisOzetiYukle` yorumu. `akislar` BOŞSA (uç verilmemiş)
          // `Promise.all([])` anında çözülür, tek bir fazladan dosya
          // okuması olmaz.
          const summary = await Promise.all(
            flows.map((ad) => akisOzetiYukle(options.root, ad, options.loadOptions)),
          );
          return { flows, active: o.flowName, summary };
        })
        .then(
          (payload) => {
            res.writeHead(200, {
              "content-type": "application/json; charset=utf-8",
              "cache-control": "no-store",
            });
            res.end(JSON.stringify(payload));
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
      current().then(
        (o) => {
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify({ prompts: promptListesi(o.topology) }));
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
      current()
        .then(async (o) => {
          // ÜYELİK — `/prompt/yaz` ile aynı kapı: yol listede AYNEN var mı.
          const items = promptListesi(o.topology);
          if (!items.some((p) => p.yol === yol)) {
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
      current().then(
        async (o) => {
          // Taslak yaşayan AKIŞTAN kuruluyor, dondurulmuş topolojiden değil:
          // kapı mesajları ve yol biçimi yalnızca akışta tam.
          const draft = active.flowPath === undefined || active.live === undefined
            ? null
            : fromFlow(active.live.flow);
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
      current().then(buildModel).then(
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
      current().then((o) => buildDetail(o, id)).then(
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
      // Tema hatırlaması DİSKTEN okunuyor (kart c-20261106-e62847,
      // port-memory.ts) — bu yüzden bu uç artık ASENKRON. `sonTemaOku`
      // kendi "bozuk kayıt kilitlemez" kuralını taşıyor (hiçbir zaman
      // fırlatmaz): dosya yoksa/bozuksa `undefined` döner, `renderPage`
      // onu "sistem" sayar — bir bozuk `ekran.json` ekranın AÇILMASINI
      // engellemez.
      sonTemaOku(options.root).then((tema) => {
        res.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          // Jeton gömülü: sayfa önbelleğe alınırsa eski jetonla açılır.
          "cache-control": "no-store",
        });
        // Gözcü ayarı da jetonla AYNI nedenle gömülü: `options.gozcu`
        // sürecin ömrü boyunca değişmiyor (DEVIR.md'nin "unmanaged" durumu,
        // kart c-20261105-92d731) — AKISLAR'ın "bir kez oku" ilkesiyle AYNI.
        res.end(renderPage(
          token,
          options.watcher ? { bayraklar: [...options.watcher.bayraklar] } : null,
          tema ?? "sistem",
        ));
      });
      return;
    }

    if (path === "/gozcu/log") {
      current().then(async (o) => {
        const lines = await gozcuLogKuyruk(join(o.root, ".skein", "gozcu.log"));
        res.writeHead(200, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        });
        res.end(JSON.stringify({ lines }));
      }).catch((error: unknown) => {
        res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata: (error as Error).message }));
      });
      return;
    }

    /**
     * AJANLAR SEKMESİNİN GERÇEKTEN YENİ UCU — DEVIR.md §6, tasarim/
     * SAPMALAR.md §3 ("ajan adım akışı": tasarımın istediği üç uçtan
     * ikisi zaten vardı, bu üçüncüsü yoktu).
     *
     * `/kart/<id>`'den BİLEREK AYRI: o `buildDetail` üstünden `git show
     * --numstat` çalıştırıyor (diff özeti için) — SANİYELİK bir yoklamada
     * bunu tekrarlamak pahalı olurdu. Bu uç yalnızca olay günlüğünü okuyor
     * (`buildSteps`, model.ts), Ajanlar panelinin "canlı" görünümü bunu
     * her saniye isteyebilir.
     *
     * OKUMA UCU — ama diğer okuma uçları gibi (yukarıdaki `if (req.method
     * !== "GET")` bloğunun İÇİNDE) hâlâ `bizeMiGeldi`'nin DNS rebinding
     * kapısından geçiyor: bu fonksiyonun EN BAŞINDA, her istekte koşan o
     * denetim buradan da ATLANAMAZ — yeni bir uç eklemek onu AYRICA
     * çağırmayı GEREKTİRMİYOR, zaten her yolun üstünde duruyor.
     */
    if (path === "/adimlar") {
      const id = queryParam(req, "kart");
      if (id === "") {
        res.writeHead(400, { "content-type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ hata: "`kart` parametresi gerekli." }));
        return;
      }
      current().then((o) => buildSteps(o, id)).then(
        (steps) => {
          if (steps === null) {
            res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
            res.end(JSON.stringify({ hata: `Kart yok: ${id}` }));
            return;
          }
          res.writeHead(200, {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          });
          res.end(JSON.stringify({ steps }));
        },
        (error: unknown) => {
          res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ hata: (error as Error).message }));
        },
      );
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
