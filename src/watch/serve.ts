import { watch, type FSWatcher } from "node:fs";
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
  topology: TopologySnapshot,
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

  while (!aborted()) {
    const result = await sweep(topology, options);
    options.onSweep?.(result, sweeps);
    sweeps += 1;

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
