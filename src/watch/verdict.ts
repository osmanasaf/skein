import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

/**
 * Ajanın cevabını bıraktığı dosya. Rolün çalıştığı worktree'nin kökünde.
 *
 * Neden dosya, neden stdout değil: SwarmForge terminal metnini regex'leyip
 * durum çıkarıyordu. Bir ajanın açıklama cümlesi ile kararı aynı kanaldan
 * geldiğinde ikisini ayırmak tahmin işine döner. Dosya, ajanın kasıtlı
 * olarak yapması gereken ayrı bir eylem: "bir şeyler yazdım" ile "kararım
 * budur" karışmaz.
 */
export const VERDICT_FILE = ".skein-verdict.json";

export type Decision = "accept" | "reject";

export interface Verdict {
  decision: Decision;
  /** `reject` için zorunlu — ret boş dönmez. */
  reason?: string;
  /** `accept` için, ne yapıldığının bir cümlelik özeti. */
  summary?: string;
}

/**
 * Verdikt okuma sonucu.
 *
 * `missing` ile `reject` KASITLI olarak ayrı: deneyde en pahalı hata,
 * hiçbir şey üretmemiş bir koşuyu "kusur bulunamadı" saymaktı. Cevap
 * vermemek bir cevap değildir.
 */
export type VerdictResult =
  | { kind: "ok"; verdict: Verdict }
  | { kind: "missing" }
  | { kind: "invalid"; problem: string };

export function verdictPath(workdir: string): string {
  return join(workdir, VERDICT_FILE);
}

/** Önceki turdan kalmış verdikt, bu turun cevabı sanılmasın. */
export async function clearVerdict(workdir: string): Promise<void> {
  await rm(verdictPath(workdir), { force: true });
}

export async function readVerdict(workdir: string): Promise<VerdictResult> {
  let text: string;
  try {
    text = await readFile(verdictPath(workdir), "utf8");
  } catch {
    return { kind: "missing" };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    return { kind: "invalid", problem: `geçerli JSON değil: ${(cause as Error).message}` };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { kind: "invalid", problem: "bir nesne olmalı" };
  }

  const doc = raw as Record<string, unknown>;
  const decision = doc["decision"];
  if (decision !== "accept" && decision !== "reject") {
    return {
      kind: "invalid",
      problem: `\`decision\` "accept" ya da "reject" olmalı, "${String(decision)}" değil`,
    };
  }

  const reason = typeof doc["reason"] === "string" ? doc["reason"].trim() : "";
  const summary = typeof doc["summary"] === "string" ? doc["summary"].trim() : "";

  if (decision === "reject" && reason === "") {
    return {
      kind: "invalid",
      problem: "`reject` kararı `reason` olmadan kabul edilmiyor — ret boş dönmez",
    };
  }

  return {
    kind: "ok",
    verdict: {
      decision,
      ...(reason === "" ? {} : { reason }),
      ...(summary === "" ? {} : { summary }),
    },
  };
}

/**
 * Ajana verdikti nasıl yazacağını anlatan metin.
 *
 * Rol promptuna değil GÖREV metnine giriyor: rol promptu görevden bağımsız
 * olmalı ki hash'i sabit kalsın ve "prompt aynıydı" iddiası kanıtlanabilsin.
 */
export function verdictInstructions(canReject: boolean): string {
  const lines = [
    "## Cevabını nasıl vereceksin",
    "",
    `İşin bittiğinde çalıştığın dizinin köküne \`${VERDICT_FILE}\` dosyasını yaz.`,
    "Bu dosya yoksa tur sonuçsuz sayılır ve iş ilerlemez.",
    "",
    "Kabul ediyorsan:",
    "```json",
    '{"decision": "accept", "summary": "ne yaptığının bir cümlelik özeti"}',
    "```",
  ];

  if (canReject) {
    lines.push(
      "",
      "İşi kabul etmiyorsan:",
      "```json",
      '{"decision": "reject", "reason": "kusurun ne olduğu — somut, tek cümlelik değil de yeterince açık"}',
      "```",
      "",
      "Ret, işi geri gönderir. Gerekçesiz ret kabul edilmiyor: alıcı rol",
      '"bir şeyler yanlış" değil, ne olduğunu okuyacak.',
    );
  } else {
    lines.push(
      "",
      "Bu rol zincirin başı — geri gönderecek bir rol yok, o yüzden `reject`",
      "seçeneğin yok. İşi yapamıyorsan `accept` yazma; dosyayı hiç yazma ve",
      "neden yapamadığını çıktına açıkla. İş insana çıkar.",
    );
  }

  return lines.join("\n");
}
