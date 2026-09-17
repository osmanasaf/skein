import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runHidden } from "./hidden.js";
import type { Task } from "./task.js";

/** Referans çözümün durduğu dizin; `hidden/` altında olduğu için üretici görmez. */
export const REFERENCE_DIR = "reference";

export interface SelfTestResult {
  /** Referans çözüm var mı. Yoksa kancaların karşılanabilirliği kanıtsız. */
  hasReference: boolean;
  /** Gizli süit gerçekten koştu mu. */
  ran: boolean;
  total: number;
  /** Referansa karşı kırmızı kalan kancalar — hepsi BOZUK TEST demektir. */
  red: string[];
  stderr: string;
}

/**
 * Gizli kancaları referans çözüme karşı koşar.
 *
 * Bir kanca, doğru bir çözümle de kırmızı kalıyorsa kusur değil bozuk test
 * ölçüyordur — ve deneyin en pahalı hatası bu: her hücrede kırmızı çıkar,
 * "kaçırma" metriğini şişirir, hiçbir üreticiyle ilgisi yoktur. Bu komut o
 * hatayı görev seti büyürken para harcamadan yakalar.
 *
 * Referans `hidden/reference/` altındadır; gizli dizin üretim bittikten
 * sonra kopyalandığı için üretici onu hiç görmez.
 */
export async function selfTest(task: Task, repo: string): Promise<SelfTestResult> {
  const cellDir = await mkdtemp(join(tmpdir(), `skein-selftest-${task.id}-`));
  try {
    const artifactDir = join(cellDir, "artifact");
    await mkdir(artifactDir, { recursive: true });

    // Gerçek koşudaki sıranın aynısı: önce mevcut kod, sonra referansın
    // üzerine yazdığı dosyalar. Referans yalnızca değiştirmesi gereken
    // dosyayı içerir; gerisi seed'den gelir.
    if (task.seedDir !== undefined) {
      await cp(task.seedDir, artifactDir, { recursive: true });
    }

    const referenceDir = join(task.hiddenDir, REFERENCE_DIR);
    let hasReference = true;
    try {
      await cp(referenceDir, artifactDir, { recursive: true });
    } catch {
      hasReference = false;
    }

    await cp(task.hiddenDir, join(cellDir, "hidden"), { recursive: true });

    const h = await runHidden(task, cellDir, repo);
    return { hasReference, ran: h.ran, total: h.hooks.length, red: h.red, stderr: h.stderr };
  } finally {
    await rm(cellDir, { recursive: true, force: true });
  }
}
