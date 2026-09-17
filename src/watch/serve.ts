import { watch, type FSWatcher } from "node:fs";
import { isOrphan } from "../card/orphan.js";
import type { RefreshResult } from "../flow/live.js";
import type { TopologySnapshot } from "../flow/snapshot.js";
import { sweep, type SweepResult } from "./loop.js";
import type { TickOptions } from "./tick.js";

export interface ServeOptions extends TickOptions {
  /** Kuyruk boşken ne sıklıkla yoklanacağı. Varsayılan 1000 ms. */
  pollMs?: number;
  /** Uyandırma için izlenecek dizin. Verilmezse yalnızca yoklama çalışır. */
  watchDir?: string;
  /** Durdurma. İptal edilince gözcü MEVCUT turu bitirip çıkar. */
  signal?: AbortSignal;
  onSweep?: (sweep: SweepResult, index: number) => void;
  /** Kuyruk boşaldı. Uyku döngüsünün her turunda değil, yalnızca girişte. */
  onIdle?: () => void;
  /**
   * Emniyet: uykuya hiç uğramadan bu kadar geçiş olursa kaçak sayılır.
   * Varsayılan 500.
   */
  maxBusySweeps?: number;
  /**
   * Akışta karşılığı olmayan rolde bekleyen kart görüldü — kart başına
   * BİR KEZ. Gözcü o kuyruğu hiç açmıyor; sessiz takılma bu projenin en
   * sevmediği şey.
   */
  onOrphan?: (card: { id: string; title: string; role: string }) => void;
  /**
   * Akış dosyasını yoklar. Geçişler ARASINDA çağrılır, ortasında değil:
   * `sweep()` rol listesini baştan alıyor ve tur ortasında değişen bir
   * topoloji, hangi anın geçerli olduğunu bulanıklaştırırdı.
   */
  refresh?: () => Promise<RefreshResult>;
  onReload?: (result: RefreshResult) => void;
}

export interface ServeSummary {
  /** Kaç geçiş yapıldı. */
  sweeps: number;
  /** Kaç kez kuyruk boşalıp uykuya gidildi. */
  naps: number;
  stopped: "signal" | "runaway";
}

/**
 * Uzun ömürlü gözcü: kuyruk boşalınca ölmez, uyur.
 *
 * `runUntilIdle` ile aynı döngü — tek fark, "kart kalmadı" sonucunun
 * ÇIKIŞ değil UYKU olması. Kazandırdığı şey de bu: kart açmak işin başlaması
 * demek olur, ikinci bir komut gerekmez.
 *
 * Süreç bir DEPO DEĞİLDİR (ARCHITECTURE). Bellekte durum tutmaz; her geçiş
 * kuyruğu dizinden yeniden okur. `kill -9` ile öldürülse `watch` toplu
 * koşusu kaldığı yerden devam eder.
 *
 * Durdurma turu yarıda kesmez: iptal sinyali geldiğinde koşan ajan bitirilir,
 * kart karara bağlanır, sonra çıkılır. Yarıda kesilen tur `active/` dizininde
 * asılı bir kart bırakırdı; `recover()` onu toplar ama ajanın harcadığı
 * para geri gelmez.
 */
export async function serve(
  /**
   * Topolojinin YAŞAYAN kaynağı. `LiveFlow` bunu karşılıyor; testler düz bir
   * nesne verebiliyor. Her geçişte yeniden okunuyor, çünkü akış dosyası
   * değişmiş olabilir.
   */
  source: { readonly topology: TopologySnapshot },
  options: ServeOptions,
): Promise<ServeSummary> {
  const pollMs = options.pollMs ?? 1000;
  const maxBusy = options.maxBusySweeps ?? 500;

  // Fonksiyon olarak okunuyor: `await` sonrası değeri değişebilir ve
  // doğrudan okunsaydı derleyici, döngü koşulundan daralttığı için "bu
  // karşılaştırma hep false" derdi.
  const aborted = (): boolean => options.signal?.aborted === true;

  let sweeps = 0;
  let naps = 0;
  let busy = 0;
  let idling = false;
  // Kart başına bir kez: her geçişte tekrarlanan uyarı, asıl çıktıyı
  // okunmaz hâle getirirdi.
  const duyurulan = new Set<string>();
  // Aynı hata her yoklamada tekrarlanırsa terminal okunmaz olur: canlı
  // koşuda 3 saniyede 48 kez yazdı. Yalnızca DEĞİŞEN hata duyurulur.
  let sonHata: string | null = null;

  while (!aborted()) {
    if (options.refresh !== undefined) {
      const reload = await options.refresh();
      // Yeni topoloji bu geçişten itibaren geçerli; yoldaki kartlar kendi
      // dondurulmuş topolojileriyle yaşamaya devam ediyor (değişmez 4).
      if (reload.kind === "reloaded") {
        sonHata = null;
        options.onReload?.(reload);
      } else if (reload.kind === "failed") {
        if (reload.message !== sonHata) {
          sonHata = reload.message;
          options.onReload?.(reload);
        }
      } else {
        sonHata = null;
      }
    }

    const topology = source.topology;
    const result = await sweep(topology, options);
    options.onSweep?.(result, sweeps);
    sweeps += 1;
    await duyurYetimleri(topology, options, duyurulan);

    if (result.moved) {
      idling = false;
      busy += 1;
      // `reject.limit` her kartın sonlu olduğunu garantiliyor; bu emniyet o
      // garantiyi delen bir kusur için. Gözcü sonsuza kadar koşacağı için
      // sayaç, kuyruk her boşaldığında sıfırlanır — yoğun bir gün kaçak
      // sayılmamalı.
      if (busy >= maxBusy) return { sweeps, naps, stopped: "runaway" };
      continue;
    }

    busy = 0;
    if (!idling) {
      idling = true;
      naps += 1;
      options.onIdle?.();
    }
    if (aborted()) break;
    await waitForWork(options.watchDir, pollMs, options.signal);
  }

  return { sweeps, naps, stopped: "signal" };
}

/**
 * Uyku: süre dolana, dizinde bir şey değişene ya da durdurma gelene kadar.
 *
 * Doğruluğu sağlayan şey yoklama; `fs.watch` yalnızca gecikmeyi kısaltır.
 * Tersi kurulsaydı, izlemenin çalışmadığı bir dosya sisteminde gözcü kartı
 * hiç görmezdi — ve bu sessiz bir arıza olurdu.
 */
async function waitForWork(dir: string | undefined, pollMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) return;

  return new Promise<void>((resolve) => {
    let done = false;
    let timer: NodeJS.Timeout | undefined;
    let watcher: FSWatcher | undefined;

    const finish = (): void => {
      if (done) return;
      done = true;
      if (timer !== undefined) clearTimeout(timer);
      watcher?.close();
      signal?.removeEventListener("abort", finish);
      resolve();
    };

    timer = setTimeout(finish, pollMs);
    signal?.addEventListener("abort", finish, { once: true });

    if (dir !== undefined) {
      try {
        // Kartlar `queue/<rol>/` altında duruyor, yani izleme ÖZYİNELEMELİ
        // olmalı. Desteklenmeyen bir platformda özyinelemesiz hâline düşer;
        // o da olmazsa yoklama zaten yeterli.
        watcher = watch(dir, { persistent: false, recursive: true }, finish);
      } catch {
        try {
          watcher = watch(dir, { persistent: false }, finish);
        } catch {
          /* izleme yok; yoklama yeter */
        }
      }
      // İzleyicinin kendi hatası uykuyu bozmamalı.
      watcher?.on("error", () => watcher?.close());
    }
  });
}

/**
 * Gözcünün göremediği kartları duyurur.
 *
 * `sweep()` yalnızca KENDİ topolojisindeki rolleri geziyor. Akış dosyası
 * değiştiyse (ya da gözcü eski listeyi taşıyorsa) bazı kartlar hiçbir turda
 * alınmıyor ve hiçbir hata üretmiyor. Tek belirti kartın ilerlememesi
 * oluyordu; artık gözcü bunu söylüyor.
 */
async function duyurYetimleri(
  topology: TopologySnapshot,
  options: ServeOptions,
  duyurulan: Set<string>,
): Promise<void> {
  if (options.onOrphan === undefined) return;
  let cards;
  try {
    cards = await options.queue.list();
  } catch {
    // Bozuk bir kart dosyası gözcüyü durdurmamalı; bu yol yalnızca uyarı
    // üretiyor, kartları hareket ettirmiyor.
    return;
  }
  for (const card of cards) {
    if (!isOrphan(card, topology) || duyurulan.has(card.id)) continue;
    duyurulan.add(card.id);
    options.onOrphan({ id: card.id, title: card.title, role: card.role });
  }
}
