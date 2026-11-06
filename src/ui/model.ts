import { stat } from "node:fs/promises";
import { join } from "node:path";
import { gateKind, planGateEntry, type Card, type CardState, type PlanKabul } from "../card/card.js";
import { isOrphan, isStale } from "../card/orphan.js";
import type { CardQueue } from "../card/queue.js";
import { readEvents, type SkeinEvent } from "../events/log.js";
import type { GateType, Receive } from "../flow/load.js";
import { DONE, roleOf, type TopologySnapshot } from "../flow/snapshot.js";
import { pidAlive, readLock, type LockInfo } from "../watch/lock.js";

/**
 * Ekranın okuduğu model.
 *
 * Tamamı TÜRETİLMİŞ: kaynak `.skein/` dizinleri, kartların kendi geçmişi ve
 * olay günlüğü. Burada tutulan hiçbir şey yeni durum değil — model silinse
 * bir sonraki okumada aynen geri gelir (ARCHITECTURE, değişmez 1).
 */
export interface UiModel {
  flow: {
    name: string;
    hash: string;
    /**
     * Akış dosyası şu an geçersizse gerekçesi.
     *
     * Bu alan olmadan kullanıcı YAML'ı bozduğunda hiçbir şey olmuyordu:
     * ekran eski topolojiyle çizmeye devam ediyor, düzenlemenin neden
     * tutmadığı görünmüyordu.
     */
    error?: string;
  };
  /** Gözcü açık mı. `null` ise hiç kilit yok. */
  daemon: { alive: boolean; info: LockInfo } | null;
  roles: UiRole[];
  /**
   * Zincirin kenarları — diyagramın çizdiği şey.
   *
   * SUNUCUDA türetiliyor, akış YAML'ından DEĞİL: `src/flow/load.ts` akışın
   * ne anlama geldiğine karar veren TEK yer olmalı (bkz. `topologyHash`
   * yorumu). Sayfa bu listeyi okur, kendi başına bir ayrıştırıcı taşımaz —
   * aksi hâlde iki yerde iki ayrı "akış ne diyor" yorumu olurdu.
   */
  edges: UiEdge[];
  /** İnsan kapıları — diyagramda zincirin üstünde durağan bir işaret. */
  gates: UiGate[];
  /**
   * Planlama politikası — akış tanımlamadıysa `null`.
   *
   * V formasyonu diyagramı (kart c-20261105-2a8dab) katılımcıların
   * üzerinden geçen bir "planlama bandı" çiziyor ve "en çok N tur"
   * etiketi basıyor; ikisi de bu alandan geliyor. `topology.plan` zaten
   * SUNUCUDA doğrulanmış (bkz. `flow/load.ts` kural 17-23) — ekran
   * burada yalnızca okuyor, katılımcı listesini ya da tur sayısını
   * YENİDEN YORUMLAMIYOR, `edges`/`gates` ile aynı ilke.
   */
  plan: { katilimcilar: string[]; tur: number } | null;
  cards: UiCard[];
  totals: {
    open: number;
    done: number;
    costUsd: number;
    /**
     * Dolar bildirmemiş aktivasyon sayısı — toplam bir ALT SINIR mı.
     *
     * Eskiden toplam `?? 0` ile kuruluyordu ve bu, projenin kendi
     * yasakladığı kalıbın ta kendisiydi (bkz. `bench/usage.ts`): zaman
     * aşımına uğrayan bir aktivasyon ölçü bildirmiyor, ekran da onu
     * harcanmamış sayıyordu. Gerçek bir koşuda 20 dakikalık bir tur
     * böyle görünmez oldu.
     */
    unmeasured: number;
    activations: number;
    orphans: number;
    /**
     * Süren engellerin kaç KARTI etkilediği — `engeller.length` DEĞİL.
     *
     * `KIRLI` dosya başına bir kayıt ürettiği için `engeller.length`
     * sekiz kirli dosyalı tek kartta "8" verir; bu alan `kartSayisi()`
     * ile gerçek kart sayısını veriyor. Ekran başlığı bunu okuyor, kendi
     * sayımını İCAT ETMİYOR (bkz. `page.ts` kuyruk engeli bandı).
     */
    engelliKart: number;
  };
  /**
   * Ayrıştırılamayan kart dosyalarının yolları.
   *
   * Bozuk dosya artık taramayı DURDURMUYOR (bir tanesi `done/` altında
   * olduğunda gözcü hiç açılamıyordu), ama görünmez de olmamalı: izole
   * etmek ile saklamak ayrı şeyler. Ekran bunu uyarı olarak basıyor.
   */
  corrupt: string[];
  /**
   * Kuyrukta duran ama ALINAMAYAN kartlar — hâlâ engelli olanlar.
   *
   * `take` artık yarışı kaybetmeyi (ENOENT) gerçek engelden ayırıyor ve
   * engeli `queue.blocked` olayına yazıyor. Ama teşhis yalnızca gözcünün
   * terminalinde ve günlükte duruyordu; operatörün baktığı yer EKRAN ve
   * orada kart sessizce kuyrukta bekliyordu.
   *
   * Olay GEÇMİŞ, engel ise bir DURUM: on dakika önceki engel çözülmüş
   * olabilir. O yüzden her olay için dosyanın hâlâ yerinde olup olmadığı
   * soruluyor — `rename` başardığı an o yol kaybolur, yani varlık testi
   * "hâlâ sıkışık mı" sorusunun tam cevabı. Kalıcı bir engel dosyası
   * tutmak gerekmiyor; durum diskte zaten yazılı.
   */
  blockages: UiEngel[];
  at: string;
}

/** Alınamayan bir kart dosyası, ekranın göreceği hâli. */
export interface UiEngel {
  path: string;
  /** `errno` kodu — "alınamadı" tek başına nedeni söylemiyor. */
  code: string;
  message: string;
  role: string;
  /** Engelin son görüldüğü an. */
  at: string;
}

export interface UiRole {
  id: string;
  provider: string;
  workspace: string;
  /** Kuyrukta bekleyen kart sayısı. */
  depth: number;
  /**
   * "Rol" panelinin meta satırı için — rol KÖK dizine göre relatif prompt
   * yolu (`roles/coder.prompt`). `card c-20261105-d500f1` (sağ panel) bunu
   * "Prompt · roles/x.md" düğmesinde kullanıyor; topolojiden zaten geliyor,
   * ekran kendi yolunu türetmiyor.
   */
  prompt: string;
  /**
   * Tekil mi toplu mu alım yapıyor — DEVIR.md'nin "Rol" panelindeki "toplu
   * alım" bilgisi. Akış düzenleyici (`rolCiz`) taslak üzerinden zaten
   * okuyordu; sağ panel YAŞAYAN topolojiden okuyor, taslaktan değil.
   */
  receive: Receive;
}

/**
 * Diyagramın tek bir oku.
 *
 * `next` zincirin ileri yönü; `reject` ve `syncBack` HER ZAMAN geriye
 * (zincirde daha önceki bir role) işaret eder — kurallar bunu şart koşuyor
 * (bkz. `load.ts` kural 6, 13). Üç tür de ayrı çizilir: sayfa rengin tek
 * taşıyıcı olmasını yasaklıyor (erişilebilirlik), o yüzden `kind` çizgi
 * biçimini de seçiyor.
 */
export interface UiEdge {
  from: string;
  to: string;
  kind: "next" | "reject" | "syncBack";
}

/** Bir rolün ÇIKIŞINDA duran insan kapısı. */
export interface UiGate {
  after: string;
  type: GateType;
}

/** Kartın panoda ve detayda gösterilen hâli. */
export interface UiCard {
  id: string;
  title: string;
  role: string;
  state: CardState;
  /** Kapıda duruyorsa hangi kapıda — çıkış kümesini bu belirler. */
  gate: "approval" | "deadlock" | "escalation" | null;
  /**
   * Kilit kapısı PLANLAMA alışverişinden mi çıktı.
   *
   * `kind: "deadlock"` iki ayrı yerden geliyor: ret limitinin dolması ve
   * planlama alışverişinin tükenmesi. Çekirdek ikisini AYIRIYOR —
   * `planGateEntry` ve `queue.release`: planlama kilidinde `forward`,
   * `role.next`'e değil `afterPlanning`'e gidiyor. Model bu ayrımı
   * taşımıyordu, ekran da ayırt edemiyordu.
   *
   * Sonucu üç yanlış ifade birden: üst etiket "ret limiti doldu" diyor
   * (hiç ret olmamış olabilir), ret rozeti hiç çıkmıyor, ve düğmeler
   * "Üretici haklı / Denetçi haklı" diyor — oysa anlaşmazlık plan
   * üzerinde ve "Üretici haklı"ya basmak kartı alışverişten SONRAKİ role
   * götürüyor. Gerçek sebep yalnızca gerekçe satırında, rozet metniyle
   * çelişerek duruyordu.
   */
  planKilidi: boolean;
  /**
   * `back` kararının gideceği rol — yoksa `null`.
   *
   * Ekran "Geri gönder" düğmesini her kapıda basıyordu. Zincirin başında
   * `back`'in hedefi yok: çekirdek kartı aynı role döndürüyor, yani olan
   * şey bir `retry`. Düğme yapmayacağı şeyi vaat ediyordu ve insan kartı
   * geri gönderdiğini sanıyordu. Model bu alanı taşımadığı için ekran
   * ayırt edemiyordu.
   */
  geriHedef: string | null;
  gateReason: string | null;
  /** Bu kart için yapılan tur sayısı. */
  turns: number;
  rejects: number;
  /** Son ret gerekçesi — kart geri döndüyse neden döndüğü. */
  lastReject: string | null;
  durationMs: number;
  costUsd: number;
  /**
   * Bu kartın dolar bildirmemiş aktivasyon sayısı.
   *
   * Sıfırdan büyükse `costUsd` bir ALT SINIR. Kartın yanında `$0.59`
   * yazması ile `≥$0.59` yazması aynı şey değil; ikincisi operatöre
   * "burada ölçülmemiş harcama var" diyor.
   */
  unmeasured: number;
  /**
   * Kartın bütün aktivasyonlarının token'ı (girdi + çıktı).
   *
   * Dolar yoksa ölçü bu: zaman aşımına uğrayan tur artık akıştan toplanan
   * token'ları bildiriyor (bkz. `Usage.kismi`), ve ekran onu göstermezse
   * bildiğinden azını söylemiş olur — harcanan yine gizlenir.
   */
  tokens: number;
  /** Kart koşuyorsa ajanın son adımı. */
  live: UiStep | null;
  /**
   * Kartın rolü YAŞAYAN akışta yok — hiçbir sütuna düşmez.
   *
   * Bu alan olmadan pano kartı sessizce eliyordu: sütunlar rollerden
   * geliyor ve hiçbir role uymayan kart filtreden düşüyordu. Bir kartın
   * ekrandan yok olması, en kötü görünüm hatası.
   */
  orphan: boolean;
  /**
   * Kart BAŞKA bir akışa ait.
   *
   * Kuyruk kök başına, akış başına değil: depoda iki akış varsa ikisinin
   * kartları aynı `.skein/` altında duruyor. Eski kod her kartı EKRANIN
   * akışıyla yargılıyordu, yani `spec` akışının sağlam bir kartı `daily`
   * panosunda YETİM görünüyor, "Kartı kapat" düğmesi çıkıyor ve POST
   * geçiyordu: kart `akışta rolü yok` gerekçesiyle kapanıyor — gerekçe
   * yanlış (rol kendi akışında duruyor) ve sürtünmesi olması gereken bir
   * karar tek düğmeyle veriliyordu.
   *
   * Başka akışın kartı bu panonun yargılayacağı şey değil: yetim de bayat
   * da sayılmıyor ve kapatma düğmesi çıkmıyor.
   */
  otherFlow: boolean;
  /** Kart farklı bir akış damgasıyla başladı — bilgi amaçlı. */
  stale: boolean;
  /**
   * Kartın hikâyesi, sırayla. Sayı tek başına anlatmıyor: "2 ret" ile
   * "kabul, ret, kapı, ret, bitti" aynı şey değil.
   */
  trail: ("accepted" | "rejected" | "gate" | "released" | "done")[];
  /**
   * Kartın yürüdüğü planın dondurulmuş kaydı — yoksa `null`.
   *
   * Tam hash burada taşınır; 12 karaktere kısaltma ekranın kendi
   * tüketicisinde (`page.ts`) yapılır, akış hash'iyle aynı ilkeyle.
   */
  /**
   * Kartın dondurduğu plan ve YÜKÜMLÜLÜKLERİ.
   *
   * `kabuller` eskiden tipte ilan EDİLMİYORDU: `toUiCard` nesneyi
   * referansla geçirdiği için veri JSON'la tarayıcıya gidiyordu ama
   * sayfada kullanılamıyordu, ve yalnızca `path · hash` basılıyordu.
   *
   * Aynı eksik `card show`'da bir kusur olarak yaşandı ve düzeltildi
   * (`planLines`): mekanizmanın amacı kabul edilmiş itirazı GÖRÜNÜR
   * kılmak, ve ekran onu basmıyorsa insan tarafında yarım kalıyor.
   * İnsan kapısında "üretici haklı / denetçi haklı" kararını verirken
   * kararın dayanağı ekranda görünmek zorunda.
   */
  plan: { path: string; hash: string; kabuller?: PlanKabul[] } | null;
}

export interface UiStep {
  seq: number;
  kind: string;
  name: string | null;
  detail: string | null;
  at: string;
}

export interface BuildOptions {
  root: string;
  queue: CardQueue;
  topology: TopologySnapshot;
  flowName: string;
  flowHash: string;
  /** Olay günlüğü yolu. Varsayılan `<root>/.skein/olaylar.jsonl`. */
  logPath?: string;
  /** Akış dosyası şu an geçersizse gerekçesi. */
  flowError?: string | null;
  /** Test edilebilirlik için; varsayılan `process.kill(pid, 0)`. */
  alive?: (pid: number) => boolean;
  now?: () => Date;
}

/** Hücre kimliğinden kart kimliği: `c-2026…:coder` → `c-2026…`. */
function cardOf(cell: string): string {
  const at = cell.lastIndexOf(":");
  return at === -1 ? cell : cell.slice(0, at);
}

export async function buildModel(options: BuildOptions): Promise<UiModel> {
  const { root, queue, topology } = options;
  const now = options.now ?? (() => new Date());

  const lockPath = join(root, ".skein", "daemon.json");
  const info = await readLock(lockPath);
  const isAlive = options.alive ?? pidAlive;

  const cards = await queue.list();
  const { events } = await readEvents(options.logPath ?? join(root, ".skein", "olaylar.jsonl"));

  const roles: UiRole[] = [];
  for (const role of topology.roles) {
    roles.push({
      id: role.id,
      provider: role.provider,
      workspace: role.workspace,
      depth: await queue.depth(role.id),
      prompt: role.prompt,
      receive: role.receive,
    });
  }

  // Kenarlar TOPOLOJİDEN çıkarılıyor, akış YAML'ından değil — topoloji
  // zaten SUNUCUDA doğrulanmış (bkz. load.ts kural 3-6, 12-14). `reject`
  // `null` olan rol (zincirin başı ya da planlama katılımcısı) için kenar
  // ÜRETİLMİYOR: boş bir kenar çizmek, olmayan bir ilişkiyi varmış gibi
  // göstermek olurdu.
  const edges: UiEdge[] = [];
  for (const role of topology.roles) {
    if (role.next !== DONE) edges.push({ from: role.id, to: role.next, kind: "next" });
    if (role.reject !== null) edges.push({ from: role.id, to: role.reject, kind: "reject" });
    for (const target of role.syncBack) edges.push({ from: role.id, to: target, kind: "syncBack" });
  }
  const gates: UiGate[] = topology.gates.map((gate) => ({ after: gate.after, type: gate.type }));
  // Katılımcı listesi KOPYALANIYOR (topology.plan.katilimcilar DEĞİL):
  // ekran bu diziyi kendi tarafında mutasyona uğratmıyor ama paylaşılan
  // bir referans taşımak, çağıranın topolojiyi yanlışlıkla değiştirdiği
  // bir kusuru burada da üretebilirdi — `snapshot()`'un kendi [...spread]
  // kuralıyla AYNI savunma.
  const plan: UiModel["plan"] = topology.plan === undefined
    ? null
    : { katilimcilar: [...topology.plan.katilimcilar], tur: topology.plan.tur };

  const byCard = groupEvents(events);
  const bizimMi = (card: Card): boolean => card.topology.flow === topology.flow;
  const ui = cards.map((card) =>
    toUiCard(card, byCard.get(card.id) ?? [], {
      // Başka akışın kartı bu panonun yargısına girmiyor: yetimlik ve
      // bayatlık ikisi de EKRANIN akışına göre tanımlı.
      orphan: bizimMi(card) && isOrphan(card, topology),
      stale: bizimMi(card) && isStale(card, options.flowHash),
      otherFlow: !bizimMi(card),
    }),
  );

  // `totals.engelliKart` da `engeller`'den okuyor — aynı liste, tek
  // sayım kuralı (`kartSayisi`), iki yerde iki ayrı yorum riski yok.
  const blockages = await surenEngeller(events);

  return {
    flow: {
      name: options.flowName,
      hash: options.flowHash,
      ...(options.flowError === undefined || options.flowError === null
        ? {}
        : { error: options.flowError }),
    },
    daemon: info === null ? null : { alive: isAlive(info.pid), info },
    roles,
    edges,
    gates,
    plan,
    cards: ui,
    totals: {
      orphans: ui.filter((c) => c.orphan).length,
      open: ui.filter((c) => c.state !== "done").length,
      done: ui.filter((c) => c.state === "done").length,
      costUsd: ui.reduce((sum, c) => sum + c.costUsd, 0),
      unmeasured: ui.reduce((sum, c) => sum + c.unmeasured, 0),
      activations: events.filter((e) => e.type === "agent.started").length,
      engelliKart: kartSayisi(blockages),
    },
    corrupt: await options.queue.bozuklar(),
    blockages,
    at: now().toISOString(),
  };
}

/**
 * Süren engellerin kaç KARTI etkilediği (ÖLÇÜM, kart c-20261106-9a451b).
 *
 * `KIRLI` kodu DOSYA başına bir kayıt üretir (`tick.ts`'teki `kirli.map`,
 * bilinçli: toplu tek satır hangi dosyayı temizleyeceğini söylemezdi) ama
 * hepsi AYNI kartın aynı turuna ait — o turda role için tek kart alınmış,
 * kirli ağaçta bulunmuş, kuyruğa geri konmuştur. Dosya sayısı kadar kayıt,
 * kart sayısı HER ZAMAN bir. Sekiz kirli dosyayı "8 kart kuyrukta
 * alınamıyor" diye basmak, tek bir kartı sekiz kart gibi göstermekti —
 * hata üretimde değil SUNUMDA: kayıt doğru, başlık onu kart sayıyormuş
 * gibi okuyordu.
 *
 * O yüzden `KIRLI` kayıtları ROLE göre gruplanır: bir role aynı anda tek
 * kart verilir (`CardQueue#take`, tek `active/<rol>` girdisi), yani aynı
 * rolün süren `KIRLI` kayıtları hep aynı kartın aynı engeline işaret eder.
 *
 * Diğer kodlarda (`GIT`, ve ileride eklenecek her yeni kod) yol GERÇEKTEN
 * bir kart/kuyruk dosyasını işaret eder — eski anlam korunuyor: her PATH
 * ayrı bir karttır.
 */
export function kartSayisi(blockages: UiEngel[]): number {
  const gruplar = new Set<string>();
  for (const blockage of blockages) {
    gruplar.add(blockage.code === "KIRLI" ? `rol:${blockage.role}` : `yol:${blockage.path}`);
  }
  return gruplar.size;
}

/**
 * Bir `KIRLI` engelinin hâlâ SÜRÜP sürmediğine karar verir (ÖLÇÜM, kart
 * c-20261106-9a451b).
 *
 * `KIRLI`'nin yolu bir KAYNAK dosyasıdır (`src/ui/server.ts` gibi) ve asla
 * kaybolmaz — `stat` her zaman başarır, yani varlık testi bu kod için
 * hiçbir şey söylemez. Ölçümde ağaç saatler önce temizlenmişti ama günlükte
 * 3155 `KIRLI` kaydı birikmişti ve ekran en yenisini sonsuza kadar
 * "sürüyor" gösteriyordu.
 *
 * Gerçek soru ağacın HÂLÂ kirli olup olmadığı. Bunun en ucuz cevabı olay
 * günlüğünden TÜRETİLEBİLİYOR, ek I/O gerekmiyor: `runRole` (tick.ts) ajanı
 * çağırmadan ÖNCE ağacı kontrol ediyor, yani bir rol için `agent.started`
 * ancak ağaç O ANDA temizse loglanabilir. Engelden SONRA aynı rol için daha
 * yeni bir `agent.started` varsa, ağaç o noktada temizdi — `KIRLI` engeli
 * çözülmüştü. (Alternatif: o çalışma ağacının git durumunu ŞU AN sormak —
 * daha doğrudan ama her yenilemede bir `git` çağrısı demek; bu yüzden
 * seçilmedi.)
 *
 * SAF: girdi engel kaydı ve rolün bilinen en yeni `agent.started` anı
 * (yoksa `undefined`), çıktı bir boolean. DOM yok, I/O yok — `surenEngeller`
 * günlüğü zaten okudu, bu fonksiyon sadece karar veriyor.
 */
export function kirliSuruyorMu(blockage: UiEngel, sonTurBaslangici: string | undefined): boolean {
  // Bu rol hiç tur başlatmamışsa (ya da engelden önce başlatılmışsa) ağacın
  // o zamandan beri temizlendiğine dair bir kanıt yok: engel hâlâ sürüyor
  // sayılır — bilmiyorsak çözülmüş SAYMIYORUZ, aynı projenin "bilmiyorsak
  // başlatma" ilkesi.
  if (sonTurBaslangici === undefined) return true;
  return sonTurBaslangici <= blockage.at;
}

/**
 * `queue.blocked` olaylarından HÂLÂ süren engelleri çıkarır.
 *
 * Aynı yol için birden çok kayıt olabilir (her geçişte bir tane); en
 * yenisi tutuluyor, yoksa ekran aynı engeli onlarca kez basardı.
 */
async function surenEngeller(events: SkeinEvent[]): Promise<UiEngel[]> {
  const sonKayit = new Map<string, UiEngel>();
  for (const event of events) {
    if (event.type !== "queue.blocked") continue;
    const e = event as unknown as { path: string; code: string; message: string; role: string; at: string };
    if (typeof e.path !== "string" || e.path === "") continue;
    // Son kayıt kazanır: olaylar sırayla okunuyor.
    sonKayit.set(e.path, {
      path: e.path,
      code: typeof e.code === "string" ? e.code : "?",
      message: typeof e.message === "string" ? e.message : "",
      role: typeof e.role === "string" ? e.role : "?",
      at: typeof e.at === "string" ? e.at : "",
    });
  }

  // `kirliSuruyorMu`'nun ihtiyaç duyduğu tek ek bilgi: rol başına bilinen
  // en yeni `agent.started` anı. Aynı günlükten, ek I/O yok — olaylar
  // sırayla okunuyor, o yüzden son yazım kazanıyor.
  const sonTurBaslangici = new Map<string, string>();
  for (const event of events) {
    if (event.type !== "agent.started") continue;
    sonTurBaslangici.set(event.role, event.at);
  }

  const suren: UiEngel[] = [];
  for (const blockage of sonKayit.values()) {
    if (blockage.code === "KIRLI") {
      // Dosyanın varlığı bu kod için hiçbir şey söylemiyor (bkz.
      // `kirliSuruyorMu`); karar olay günlüğünden türüyor.
      if (kirliSuruyorMu(blockage, sonTurBaslangici.get(blockage.role))) suren.push(blockage);
      continue;
    }
    // Diğer kodlarda yol bir kart/kuyruk dosyası: dosya yerinde değilse
    // engel çözülmüş (kart alındı ya da taşındı). Çözülmüş engeli basmak,
    // operatöre olmayan bir arıza göstermek olurdu.
    try {
      await stat(blockage.path);
    } catch {
      continue;
    }
    suren.push(blockage);
  }
  // En yeni önce: ekranda ilk göreceği şey en son olan olmalı.
  return suren.sort((a, b) => b.at.localeCompare(a.at));
}

function groupEvents(events: SkeinEvent[]): Map<string, SkeinEvent[]> {
  const byCard = new Map<string, SkeinEvent[]>();
  for (const event of events) {
    const cell = (event as { cell?: unknown }).cell;
    if (typeof cell !== "string") continue;
    const id = cardOf(cell);
    const list = byCard.get(id);
    if (list === undefined) byCard.set(id, [event]);
    else list.push(event);
  }
  return byCard;
}

function toUiCard(
  card: Card,
  events: SkeinEvent[],
  hiza: { orphan: boolean; stale: boolean; otherFlow: boolean },
): UiCard {
  let costUsd = 0;
  let durationMs = 0;
  // BİLDİRİLMEYEN SIFIR DEĞİLDİR. Dolar bildirmeyen her aktivasyon
  // sayılıyor; `?? 0` ile toplamak onları harcanmamış gösterirdi.
  let unmeasured = 0;
  let tokens = 0;
  for (const event of events) {
    if (event.type !== "agent.finished") continue;
    durationMs += event.durationMs;
    const dolar = event.usage?.costUsd;
    if (typeof dolar === "number") costUsd += dolar;
    else unmeasured += 1;
    tokens += (event.usage?.inputTokens ?? 0) + (event.usage?.outputTokens ?? 0);
  }

  const trail: UiCard["trail"] = [];
  let rejects = 0;
  let turns = 0;
  let lastReject: string | null = null;
  for (const entry of card.history) {
    if (entry.event === "taken") turns += 1;
    else if (entry.event === "handoff") trail.push("accepted");
    else if (entry.event === "reject") {
      trail.push("rejected");
      rejects += 1;
      lastReject = entry.reason;
    } else if (entry.event === "gate") trail.push("gate");
    else if (entry.event === "released") trail.push("released");
    else if (entry.event === "done") trail.push("done");
  }

  return {
    id: card.id,
    title: card.title,
    role: card.role,
    state: card.state,
    gate: gateKind(card),
    planKilidi: planGateEntry(card) !== null,
    // Kartın KENDİ topolojisinden: kapı kararını da `kapiKarari` oradan
    // okuyor, yani düğme ile çekirdek aynı kaynağa bakıyor.
    geriHedef: roleOf(card.topology, card.role)?.reject ?? null,
    gateReason: lastGateReason(card),
    turns,
    rejects,
    lastReject,
    durationMs,
    costUsd,
    unmeasured,
    tokens,
    live: card.state === "active" ? lastStep(events) : null,
    orphan: hiza.orphan,
    stale: hiza.stale,
    otherFlow: hiza.otherFlow,
    trail,
    plan: card.plan ?? null,
  };
}

function lastGateReason(card: Card): string | null {
  if (card.state !== "gate") return null;
  for (let i = card.history.length - 1; i >= 0; i -= 1) {
    const entry = card.history[i];
    if (entry?.event === "gate") return entry.reason;
    if (entry?.event === "handoff") return null;
  }
  return null;
}

/**
 * Son aktivasyonun (en son `agent.started`'dan bu yana) TAM adım izi —
 * Ajanlar sekmesinin "Adımlar" listesi (DEVIR.md §6, kart c-20261105-d304ed)
 * bunu istiyor: `lastStep` SADECE sonuncuyu veriyordu, pano kartının tek
 * satırlık "canlı adım" bilgisi için yeterliydi ama bu liste TÜM izi
 * gösteriyor.
 *
 * Pencere `lastStep` ile AYNI ilkeyi taşıyor — ve KASITLI OLARAK aynı
 * "bitince boşalır" kuralını da: `agent.finished` görülürse bu aktivasyon
 * artık "şu an" değildir, boş dizi dönüyor. İki ayrı kural yazmak (biri
 * burada biri `lastStep`'te) ileride birbirinden SESSİZCE AYRIŞABİLİRDİ —
 * bu depodaki en sık tekrar eden kusur sınıfı; `lastStep` bu yüzden bu
 * fonksiyonun ÜZERİNE kuruluyor, aşağıda.
 *
 * Sıra ARTAN (seq 1'den, günlüğe yazılış sırasıyla) — Ajanlar ekranı
 * "en yenisi en üstte" göstermek istiyorsa bunu TERSİNE çeviren taraf
 * istemci (bkz. page.ts ajanAdimlariCiz), burada İKİNCİ bir sıralama
 * kuralı İCAT EDİLMİYOR.
 */
export function activationSteps(events: SkeinEvent[]): UiStep[] {
  let from = 0;
  for (const [i, event] of events.entries()) {
    if (event.type === "agent.started") from = i;
  }
  const steps: UiStep[] = [];
  for (const event of events.slice(from)) {
    if (event.type === "agent.finished") return [];
    if (event.type !== "agent.step") continue;
    steps.push({
      seq: event.seq,
      kind: event.kind,
      name: event.name ?? null,
      detail: event.detail ?? null,
      at: event.at,
    });
  }
  return steps;
}

/**
 * Koşan ajanın son adımı — `activationSteps`in SONUNCUSU. Boş aktivasyon
 * (hiç bitmemiş ya da bitmiş) `null`e eşit: bu iki fonksiyonun "canlı"
 * tanımı AYNI kaynaktan geliyor, pano kartının tek satırı ile Ajanlar
 * sekmesinin tam listesi birbirinden SAPAMAZ.
 */
function lastStep(events: SkeinEvent[]): UiStep | null {
  const steps = activationSteps(events);
  return steps.length === 0 ? null : (steps[steps.length - 1] ?? null);
}

/**
 * Bir kartın GÜNCEL aktivasyonunun tam adım izi — Ajanlar sekmesinin
 * GERÇEKTEN yeni uç noktası (`GET /adimlar?kart=`, bkz. server.ts).
 *
 * `buildDetail`'den BİLEREK ayrı: o `git show --numstat` çalıştırıyor
 * (diff özeti için) ve bunu SANİYELİK bir yoklamada tekrarlamak pahalı
 * olurdu. Bu fonksiyon yalnızca olay günlüğünü okuyor — Ajanlar panelinin
 * "canlı" görünümü bunu her saniye isteyebilir.
 *
 * Kart yoksa `null` — `buildDetail`'in "kart yok" ayrımıyla AYNI, çağıran
 * (server.ts) bunu 404'e çeviriyor.
 */
export async function buildSteps(options: BuildOptions, id: string): Promise<UiStep[] | null> {
  const card = await options.queue.get(id);
  if (card === null) return null;
  const { events } = await readEvents(options.logPath ?? join(options.root, ".skein", "olaylar.jsonl"));
  const mine = events.filter((event) => {
    const cell = (event as { cell?: unknown }).cell;
    return typeof cell === "string" && cardOf(cell) === id;
  });
  return activationSteps(mine);
}

/** Kartın detay görünümü: tam iz + devredilen commit'in diff özeti. */
export interface UiDetail {
  card: UiCard;
  history: UiHistory[];
  diff: UiDiff | null;
}

export interface UiHistory {
  at: string;
  event: string;
  who: string;
  note: string | null;
  commit: string | null;
  /**
   * Planlama alışverişi turu (PLANLAMA.md 6b) — yalnızca `event: "plan"`
   * kayıtlarında dolu, diğer her kayıtta `null`.
   *
   * Alan adları `HistoryEntry`'nin `plan` olayıyla birebir aynı; ekran bu
   * sayıları yeniden yorumlamaz, olduğu gibi taşır.
   */
  plan: {
    action: "yazdi" | "itiraz" | "cevap";
    round: number;
    objections: number | null;
    accepted: number | null;
    invalid: number | null;
  } | null;
}

export interface UiDiff {
  commit: string;
  files: { path: string; add: number; del: number }[];
}

export interface DetailOptions extends BuildOptions {
  /** Test edilebilirlik için; varsayılan gerçek `git show --numstat`. */
  numstat?: (root: string, commit: string) => Promise<string>;
}

/**
 * Bir kartın detayı.
 *
 * "En son neden reddedildi" ve "kodda ne değişti" sorularının cevabı burada:
 * gerekçeler kartın kendi geçmişinden, diff ise geçmişteki commit'ten. İkisi
 * de TÜRETİLMİŞ — ekran hiçbir şey saklamıyor.
 */
export async function buildDetail(options: DetailOptions, id: string): Promise<UiDetail | null> {
  const card = await options.queue.get(id);
  if (card === null) return null;

  const { events } = await readEvents(
    options.logPath ?? join(options.root, ".skein", "olaylar.jsonl"),
  );
  const mine = groupEvents(events).get(id) ?? [];

  const history: UiHistory[] = card.history.map((entry) => {
    const who =
      "from" in entry && "to" in entry
        ? `${entry.from} → ${entry.to}`
        : "from" in entry
          ? entry.from
          : "role" in entry
            ? entry.role
            : "";
    const note =
      "reason" in entry
        ? entry.reason
        : "summary" in entry && entry.summary !== undefined
          ? entry.summary
          : null;
    return {
      at: entry.at,
      event: entry.event,
      who,
      note,
      commit: "commit" in entry && entry.commit !== undefined ? entry.commit : null,
      plan: entry.event === "plan"
        ? {
            action: entry.action,
            round: entry.round,
            objections: entry.objections ?? null,
            accepted: entry.accepted ?? null,
            invalid: entry.invalid ?? null,
          }
        : null,
    };
  });

  // En son devredilen commit: "kodda ne değişti" sorusunun konusu.
  let commit: string | null = null;
  for (const entry of card.history) {
    if ((entry.event === "handoff" || entry.event === "reject") && entry.commit !== undefined) {
      commit = entry.commit;
    }
  }

  const bizim = card.topology.flow === options.topology.flow;

  return {
    card: toUiCard(card, mine, {
      // Kart detayında da aynı kural: başka akışın kartı bu panonun
      // yargısına girmiyor.
      orphan: bizim && isOrphan(card, options.topology),
      stale: bizim && isStale(card, options.flowHash),
      otherFlow: !bizim,
    }),
    history,
    diff: commit === null ? null : await readDiff(options, commit),
  };
}

async function readDiff(options: DetailOptions, commit: string): Promise<UiDiff | null> {
  const run = options.numstat ?? defaultNumstat;
  let out: string;
  try {
    out = await run(options.root, commit);
  } catch {
    // Commit bu depoda yoksa (dal silinmiş, worktree temizlenmiş) detay yine
    // gösterilir — diff'siz. Ekran, eksik bir parçası yüzünden kapanmamalı.
    return null;
  }
  const files: UiDiff["files"] = [];
  for (const line of out.split("\n")) {
    const parts = line.trim().split("\t");
    if (parts.length < 3) continue;
    const [add, del, path] = parts;
    files.push({
      path: path ?? "",
      add: Number(add) || 0,
      del: Number(del) || 0,
    });
  }
  return files.length === 0 ? null : { commit, files };
}

async function defaultNumstat(root: string, commit: string): Promise<string> {
  const { capture } = await import("../proc/process.js");
  const result = await capture("git", ["show", "--numstat", "--format=", commit], {
    cwd: root,
    timeoutMs: 10_000,
  });
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || "git show başarısız");
  return result.stdout;
}
