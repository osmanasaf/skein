import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/**
 * Katman sınırı işareti.
 *
 * Birleşik promptta her katmanın nereden geldiğini makine-okunur biçimde
 * işaretler. Kaynak dosyaların hiçbiri bu işareti içeremez — içerirse
 * birleştirici reddeder. SwarmForge'da anayasanın üstünlüğü bir
 * konvansiyondu ve sessizce ihlal edilebiliyordu; burada bir rol promptu
 * sahte katman sınırı açıp kendini kanun ilan edemez.
 */
export const LAYER_MARK = "<<<skein:layer";

export interface PromptLayer {
  /** Katmanın kimliği — birleşik dosyada ve hash'te görünür. */
  name: string;
  path: string;
}

export interface AssembledLayer {
  name: string;
  path: string;
  bytes: number;
}

export interface AssembledPrompt {
  /** Adaptöre `promptFile` olarak verilecek tam metin. */
  text: string;
  /** SHA-256 (hex). Olay günlüğüne yazılır. */
  hash: string;
  layers: AssembledLayer[];
}

class PromptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PromptError";
  }
}

/**
 * Katmanlı bir prompt derler.
 *
 * Neden çekirdek derliyor, ajan okumuyor: Skein'de ajan headless ve iş
 * başına tek süreç. "Şu dizindeki dosyaları oku" talimatı, ajanın uzun
 * ömürlü ve interaktif olduğu bir dünyanın kalıntısı — bizde çalışmaz.
 *
 * `taskText` KASITLI olarak burada yok; adaptöre ayrı alan olarak gider.
 * Böylece aynı rolün promptu her görevde aynı hash'i taşır ve "prompt
 * sabitti" iddiası görevden bağımsız kanıtlanabilir.
 */
export async function assemblePrompt(layers: PromptLayer[]): Promise<AssembledPrompt> {
  if (layers.length === 0) {
    throw new PromptError("Prompt en az bir katman gerektirir.");
  }

  const seenPath = new Map<string, string>();
  const seenName = new Map<string, string>();
  for (const layer of layers) {
    const priorName = seenPath.get(layer.path);
    if (priorName !== undefined) {
      throw new PromptError(
        `Aynı dosya iki kez katman olarak verildi: ${layer.path} ` +
          `(\`${priorName}\` ve \`${layer.name}\`).`,
      );
    }
    seenPath.set(layer.path, layer.name);

    const priorPath = seenName.get(layer.name);
    if (priorPath !== undefined) {
      throw new PromptError(
        `Yinelenen katman adı: \`${layer.name}\` (${priorPath} ve ${layer.path}).`,
      );
    }
    seenName.set(layer.name, layer.path);
  }

  const parts: string[] = [];
  /** Hash'in üzerinden hesaplandığı kanonik biçim: yalnızca ad ve içerik. */
  const canonical: string[] = [];
  const assembled: AssembledLayer[] = [];

  for (const layer of layers) {
    let body: string;
    try {
      body = await readFile(layer.path, "utf8");
    } catch (cause) {
      throw new PromptError(
        `\`${layer.name}\` katmanı okunamadı: ${layer.path} — ${(cause as Error).message}`,
      );
    }

    if (body.trim() === "") {
      throw new PromptError(
        `\`${layer.name}\` katmanı boş: ${layer.path}. ` +
          `Sessizce etkisiz kalan bir katman, olmayan katmandan daha kötüdür.`,
      );
    }

    if (body.includes(LAYER_MARK)) {
      throw new PromptError(
        `\`${layer.name}\` katmanı katman sınırı işareti (${LAYER_MARK}) içeriyor: ` +
          `${layer.path}. Bir katman kendi sınırlarını uyduramaz — kurcalamaya ` +
          `karşı koruma.`,
      );
    }

    const trimmed = body.trimEnd();
    parts.push(`${LAYER_MARK} name="${layer.name}" src="${layer.path}">>>`);
    parts.push(trimmed);
    parts.push("");
    canonical.push(`${layer.name}\u0000${trimmed}`);
    assembled.push({ name: layer.name, path: layer.path, bytes: Buffer.byteLength(body, "utf8") });
  }

  const text = parts.join("\n");
  // Yol KASITLI olarak hash'in dışında: aynı prompt, farklı checkout'ta aynı
  // hash vermeli. Metin yolu insan okuyucu için taşımaya devam eder.
  const hash = createHash("sha256").update(canonical.join("\u0001"), "utf8").digest("hex");
  return { text, hash, layers: assembled };
}
