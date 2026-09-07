import { mkdir, open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type GateReason =
  /** İlk devir teslim denemesi. Her zaman reddedilir. */
  | "ilk-deneme"
  /** Denetim turunda iş değişti: yeni tur açılır. */
  | "degisti"
  /** Hiçbir şey değişmedi: devir teslim gerçekleşir. */
  | "degismedi";

export interface GateDecision {
  accepted: boolean;
  /** Bu görevde harcanan toplam tur sayısı. "Görev başına audit turu" metriği. */
  round: number;
  reason: GateReason;
}

interface GateState {
  fingerprint: string;
  rounds: number;
}

export interface GateOptions {
  /** Kilit bu süreden eskiyse sahibi ölmüş sayılır ve devralınır. */
  staleLockMs?: number;
  lockTimeoutMs?: number;
}

/**
 * Devir teslim denetim kapısı.
 *
 * Bir ajan işi devretmek istediğinde ilk deneme reddedilir; ajan işini
 * yeniden denetlemek zorunda kalır. Denetim sırasında bir düzeltme yaparsa
 * parmak izi değişir ve yeni bir tur başlar. Devir teslim ancak hiçbir şeyin
 * değişmediği bir turdan sonra gerçekleşir (PHILOSOPHY 6).
 *
 * Dürüst sınır, felsefede yazılı: mekanizma töreni zorunlu kılar, özeni
 * değil. Denetimi gerçekten yapmayan bir ajan da geçer. Bu bir garanti
 * değil, sürtünme.
 */
export class AuditGate {
  readonly #statePath: string;
  readonly #lockPath: string;
  readonly #staleLockMs: number;
  readonly #lockTimeoutMs: number;

  constructor(statePath: string, options: GateOptions = {}) {
    this.#statePath = statePath;
    this.#lockPath = `${statePath}.lock`;
    this.#staleLockMs = options.staleLockMs ?? 30_000;
    this.#lockTimeoutMs = options.lockTimeoutMs ?? 5_000;
  }

  async read(): Promise<GateState | undefined> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.#statePath, "utf8"));
      if (parsed !== null && typeof parsed === "object") return parsed as GateState;
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Devir teslim dener. Okuma ve yazma kilit altında yapılır: iki ajan aynı
   * anda denerse ikisi de "ilk deneme" görüp turu kaybetmemeli.
   */
  async attempt(fingerprint: string): Promise<GateDecision> {
    await mkdir(dirname(this.#statePath), { recursive: true });
    await this.#lock();
    try {
      const prior = await this.read();
      const round = (prior?.rounds ?? 0) + 1;

      const reason: GateReason =
        prior === undefined ? "ilk-deneme" : prior.fingerprint === fingerprint ? "degismedi" : "degisti";
      // İlk deneme, değişmemiş de olsa reddedilir: sürtünmenin kendisi bu.
      const accepted = reason === "degismedi";

      await this.#write({ fingerprint, rounds: round });
      return { accepted, round, reason };
    } finally {
      await rm(this.#lockPath, { force: true });
    }
  }

  /** Atomik yazma: yarım yazılmış durum dosyası turu kaybettirir. */
  async #write(state: GateState): Promise<void> {
    const tmp = join(dirname(this.#statePath), `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`);
    await writeFile(tmp, JSON.stringify(state));
    await rename(tmp, this.#statePath);
  }

  async #lock(): Promise<void> {
    const deadline = Date.now() + this.#lockTimeoutMs;
    for (;;) {
      try {
        const handle = await open(this.#lockPath, "wx");
        await handle.close();
        return;
      } catch {
        if (await this.#stealIfStale()) continue;
        if (Date.now() >= deadline) {
          throw new Error(`Audit kilidi alınamadı: ${this.#lockPath}`);
        }
        await new Promise((r) => setTimeout(r, 20));
      }
    }
  }

  /** Sahibi ölmüş bir kilit, kapıyı sonsuza kadar kapalı tutmamalı. */
  async #stealIfStale(): Promise<boolean> {
    try {
      const info = await stat(this.#lockPath);
      if (Date.now() - info.mtimeMs > this.#staleLockMs) {
        await rm(this.#lockPath, { force: true });
        return true;
      }
    } catch {
      // Kilit bu arada bırakılmış.
    }
    return false;
  }
}
